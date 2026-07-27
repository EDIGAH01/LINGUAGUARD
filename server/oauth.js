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
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `${p.authorizeUrl}?${params.toString()}`;
}

/** Consumes the one-time state, returning the stashed context or null if missing/expired/already used. */
function consumeState(state) {
  const raw = getKv(`oauth_state_${state}`);
  if (!raw) return null;
  setKv(`oauth_state_${state}`, ""); // one-time use, mirrors phone/reset code consumption elsewhere
  const parsed = JSON.parse(raw);
  if (Date.now() - parsed.createdAt > STATE_TTL_MS) return null;
  return parsed;
}

async function exchangeCode(provider, code, codeVerifier, redirectUri) {
  const p = PROVIDERS[provider];
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
