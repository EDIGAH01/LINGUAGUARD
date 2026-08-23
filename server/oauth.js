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
    // Meta issues short-lived (~1h) tokens that must be exchanged for a
    // long-lived (~60d) one, and re-exchanged before expiry to roll forward —
    // there is no refresh_token. extendMetaToken() handles both.
    meta: true,
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
  youtube: {
    label: "YouTube",
    // Standard Google OAuth 2.0. Google supports PKCE for web-app clients, so
    // we keep the code_challenge (unlike Meta).
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdEnv: "YOUTUBE_CLIENT_ID",
    clientSecretEnv: "YOUTUBE_CLIENT_SECRET",
    // readonly → read the channel, its videos and comment threads.
    // force-ssl → additionally hold/remove comments (real moderation actions).
    scope:
      "https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.force-ssl",
    clientIdParam: "client_id",
    tokenAuthStyle: "body",
    // Google only returns a refresh_token when asked with access_type=offline,
    // and only reliably re-issues one with prompt=consent — neither is part of
    // the base authorize params, so they're merged in via extraAuthParams.
    extraAuthParams: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
    async fetchProfile(accessToken) {
      // The connected user's own YouTube channel.
      const res = await fetch(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res.ok) {
        const data = await res.json();
        const channel = data.items?.[0];
        if (channel) {
          return {
            externalId: channel.id,
            username: channel.snippet?.customUrl || channel.snippet?.title,
            displayName: channel.snippet?.title,
          };
        }
      }
      // A Google account without a YouTube channel — fall back to basic profile.
      const me = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!me.ok) throw new Error(`profile fetch failed: HTTP ${res.status}`);
      const info = await me.json();
      return { externalId: info.id, username: info.email, displayName: info.name || info.email };
    },
  },
  facebook: {
    label: "Facebook",
    // Same Meta OAuth dialog as Instagram, but Page-oriented scopes: read the
    // Pages the user manages, their posts, and the comments on them — plus
    // manage_engagement so blocked comments can actually be hidden on-platform.
    authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    clientIdEnv: "FACEBOOK_APP_ID",
    clientSecretEnv: "FACEBOOK_APP_SECRET",
    scope: "pages_show_list,pages_read_engagement,pages_manage_engagement",
    clientIdParam: "client_id",
    tokenAuthStyle: "body",
    tokenMethod: "GET",
    noPkce: true,
    meta: true,
    async fetchProfile(accessToken) {
      // Identify the connection by the first Page the user manages (that's what
      // gets moderated); fall back to the Facebook user's own name.
      const res = await fetch(
        `https://graph.facebook.com/v21.0/me/accounts?fields=name,username&access_token=${accessToken}`
      );
      if (res.ok) {
        const data = await res.json();
        const page = data.data?.[0];
        if (page) return { externalId: page.id, username: page.username || page.name, displayName: page.name };
      }
      const me = await fetch(`https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${accessToken}`);
      if (!me.ok) throw new Error(`profile fetch failed: HTTP ${res.status}`);
      const info = await me.json();
      return { externalId: info.id, username: info.name, displayName: info.name };
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

  // Provider-specific authorize params (e.g. Google's access_type=offline /
  // prompt=consent, needed to actually receive a refresh_token).
  if (p.extraAuthParams) {
    for (const [k, v] of Object.entries(p.extraAuthParams)) params.set(k, v);
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

/**
 * Exchanges a stored refresh_token for a fresh access_token. Used by the
 * ingestion poller when a connection's access token has expired. Works for
 * providers that issue refresh tokens (Google/YouTube via access_type=offline,
 * X via offline.access). Meta's long-lived tokens aren't refreshed this way —
 * they simply expire after ~60 days and the user reconnects — so callers only
 * invoke this when a refreshToken actually exists.
 */
async function refreshAccessToken(provider, refreshToken) {
  const p = PROVIDERS[provider];
  if (!p || !refreshToken) return null;

  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken });
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
    throw new Error(data.error_description || data.error || `token refresh failed: HTTP ${res.status}`);
  }
  return data; // { access_token, expires_in, refresh_token? }
}

/**
 * Meta's token lifecycle has no refresh_token. Instead, a valid token is
 * re-exchanged via grant_type=fb_exchange_token to obtain a fresh ~60-day
 * token. Called both right after connect (short-lived → long-lived) and by the
 * ingestion poller when a stored token is nearing expiry (long-lived →
 * long-lived, rolling the window forward while it's still valid).
 */
async function extendMetaToken(provider, token) {
  const p = PROVIDERS[provider];
  if (!p?.meta) return null;
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: process.env[p.clientIdEnv],
    client_secret: process.env[p.clientSecretEnv],
    fb_exchange_token: token,
  });
  const res = await fetch(`${p.tokenUrl}?${params.toString()}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error?.message || data.error || `token extend failed: HTTP ${res.status}`);
  }
  return data; // { access_token, token_type, expires_in }
}

module.exports = { PROVIDERS, isConfigured, startAuth, consumeState, exchangeCode, fetchProfile, refreshAccessToken, extendMetaToken };
