const crypto = require("crypto");
const { getKv, setKv } = require("./db");

const STATE_TTL_MS = 10 * 60 * 1000;

/**
 * Real OAuth 2.0 Authorization Code + PKCE flow, shared across providers.
 * PKCE (not just a client secret) matters here because the redirect leg
 * happens in the user's own browser — a code intercepted in transit is
 * useless without the verifier that only this server ever holds.
 */
const PROVIDERS = {
  instagram: {
    label: "Instagram",
    // Meta's OAuth 2.0 dialog. Instagram Basic Display API was deprecated in
    // Dec 2024; the current path is Facebook Login for Business / Instagram
    // Graph API, which uses the same authorize endpoint as Facebook but with
    // instagram_basic + instagram_manage_comments scopes.
    authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    clientIdEnv: "INSTAGRAM_APP_ID",
    clientSecretEnv: "INSTAGRAM_APP_SECRET",
    // instagram_basic → read profile/media
    // pages_show_list + instagram_manage_comments → comment moderation
    // (requires Business/Creator account linked to a Facebook Page)
    scope: "instagram_basic,instagram_manage_comments,pages_show_list",
    clientIdParam: "client_id",
    // Meta expects client_id + client_secret as query params on the token URL,
    // NOT as HTTP Basic auth.
    tokenAuthStyle: "body",
    // Meta's token endpoint uses GET (not POST) — flag it so exchangeCode
    // can handle it correctly.
    tokenMethod: "GET",
    // Meta's OAuth 2.0 does not support PKCE — skip code_challenge params.
    noPkce: true,
    async fetchProfile(accessToken) {
      // Get the Instagram Business/Creator account linked to this token.
      // First get the Facebook user's pages, then find the IG account on each.
      const meRes = await fetch(
        `https://graph.facebook.com/v21.0/me/accounts?fields=name,instagram_business_account{id,name,username}&access_token=${accessToken}`
      );
      if (!meRes.ok) {
        // Fallback: just get the Facebook user display name
        const fbMe = await fetch(`https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${accessToken}`);
        if (!fbMe.ok) throw new Error(`profile fetch failed: HTTP ${meRes.status}`);
        const fb = await fbMe.json();
        return { externalId: fb.id, username: fb.name, displayName: fb.name };
      }
      const pagesData = await meRes.json();
      // Find first page with a linked IG business account
      const pageWithIg = pagesData.data?.find(p => p.instagram_business_account);
      if (pageWithIg) {
        const ig = pageWithIg.instagram_business_account;
        return {
          externalId: ig.id,
          username: ig.username || ig.name,
          displayName: ig.name || ig.username,
        };
      }
      // Fallback: use the Facebook page name itself
      const page = pagesData.data?.[0];
      if (page) return { externalId: page.id, username: page.name, displayName: page.name };
      // Last resort: basic /me
      const fbMe2 = await fetch(`https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${accessToken}`);
      const fb2 = await fbMe2.json();
      return { externalId: fb2.id, username: fb2.name, displayName: fb2.name };
    },
  },
  x: {
    label: "X",
    authorizeUrl: "https://x.com/i/oauth2/authorize",
    tokenUrl: "https://api.x.com/2/oauth2/token",
    clientIdEnv: "X_CLIENT_ID",
    clientSecretEnv: "X_CLIENT_SECRET",
    scope: "tweet.read users.read offline.access",
    clientIdParam: "client_id",
    // X requires HTTP Basic auth (client_id:client_secret) at the token endpoint.
    tokenAuthStyle: "basic",
    async fetchProfile(accessToken) {
      const res = await fetch("https://api.x.com/2/users/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`profile fetch failed: HTTP ${res.status}`);
      const { data } = await res.json();
      return { externalId: data.id, username: data.username, displayName: data.name };
    },
  },
  tiktok: {
    label: "TikTok",
    authorizeUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    clientIdEnv: "TIKTOK_CLIENT_KEY",
    clientSecretEnv: "TIKTOK_CLIENT_SECRET",
    scope: "user.info.basic",
    clientIdParam: "client_key",
    // TikTok wants client_key/client_secret as regular body fields, not Basic auth.
    tokenAuthStyle: "body",
    async fetchProfile(accessToken) {
      const res = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,username,display_name", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`profile fetch failed: HTTP ${res.status}`);
      const { data } = await res.json();
      return { externalId: data.user.open_id, username: data.user.username, displayName: data.user.display_name };
    },
  },
};

function isConfigured(provider) {
  const p = PROVIDERS[provider];
  return Boolean(p && process.env[p.clientIdEnv] && process.env[p.clientSecretEnv]);
}

function base64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Builds the authorize URL and stashes {userId, provider, codeVerifier, redirectUri} server-side, keyed by a random state. */
function startAuth(provider, userId, redirectUri) {
  const p = PROVIDERS[provider];
  if (!p) throw new Error(`Unknown OAuth provider: ${provider}`);
  if (!isConfigured(provider)) {
    throw new Error(`${p.label} isn't configured on this server yet — set ${p.clientIdEnv} / ${p.clientSecretEnv} in .env.`);
  }

  const state = base64url(crypto.randomBytes(24));
  const codeVerifier = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(crypto.createHash("sha256").update(codeVerifier).digest());

  setKv(
    `oauth_state_${state}`,
    JSON.stringify({ userId, provider, codeVerifier, redirectUri, createdAt: Date.now() })
  );

  const params = new URLSearchParams({
    response_type: "code",
    [p.clientIdParam]: process.env[p.clientIdEnv],
    redirect_uri: redirectUri,
    scope: p.scope,
    state,
  });

  // PKCE is not supported by Meta's OAuth 2.0 implementation — only add
  // code_challenge for providers that explicitly support it.
  if (!p.noPkce) {
    params.set("code_challenge", codeChallenge);
    params.set("code_challenge_method", "S256");
  }

  return `${p.authorizeUrl}?${params.toString()}`;
}

/** Consumes the one-time state, returning the stashed context or null if missing/expired/already used. */
function consumeState(state) {
  const raw = getKv(`oauth_state_${state}`);
  if (!raw) return null;
  // Delete the key by overwriting with a sentinel that won't JSON.parse as a
  // valid context object. Using a dedicated delete via setKv is not possible
  // (kv_store has no DELETE helper), so an empty string acts as a tombstone —
  // but we must guard against re-reading it here, which is why we check !raw
  // above: an empty string is falsy, so a tombstoned key is correctly rejected.
  setKv(`oauth_state_${state}`, ""); // one-time use, mirrors phone/reset code consumption elsewhere
  const parsed = JSON.parse(raw);
  if (Date.now() - parsed.createdAt > STATE_TTL_MS) return null;
  return parsed;
}

async function exchangeCode(provider, code, codeVerifier, redirectUri) {
  const p = PROVIDERS[provider];

  // Meta's token endpoint is a GET with query params, not a POST body.
  // Everything else uses POST + URL-encoded body.
  if (p.tokenMethod === "GET") {
    const params = new URLSearchParams({
      client_id: process.env[p.clientIdEnv],
      client_secret: process.env[p.clientSecretEnv],
      redirect_uri: redirectUri,
      code,
    });
    const res = await fetch(`${p.tokenUrl}?${params.toString()}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error?.message || data.error_description || data.error || `token exchange failed: HTTP ${res.status}`);
    }
    return data;
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const headers = { "Content-Type": "application/x-www-form-urlencoded" };
  if (p.tokenAuthStyle === "basic") {
    const basic = Buffer.from(`${process.env[p.clientIdEnv]}:${process.env[p.clientSecretEnv]}`).toString("base64");
    headers.Authorization = `Basic ${basic}`;
  } else {
    body.set(p.clientIdParam, process.env[p.clientIdEnv]);
    body.set("client_secret", process.env[p.clientSecretEnv]);
  }

  const res = await fetch(p.tokenUrl, { method: "POST", headers, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error_description || data.error || `token exchange failed: HTTP ${res.status}`);
  }
  return data; // { access_token, refresh_token?, expires_in, ... }
}

async function fetchProfile(provider, accessToken) {
  return PROVIDERS[provider].fetchProfile(accessToken);
}

module.exports = { PROVIDERS, isConfigured, startAuth, consumeState, exchangeCode, fetchProfile };
