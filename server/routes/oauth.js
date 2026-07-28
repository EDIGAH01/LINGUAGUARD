const express = require("express");
const crypto = require("crypto");
const { requireAuth, encryptSecret } = require("../auth");
const { load, save } = require("../db");
const { isConfigured, startAuth, consumeState, exchangeCode, fetchProfile, PROVIDERS } = require("../oauth");

const router = express.Router();

function redirectUriFor(req, provider) {
  // Must byte-for-byte match what's registered in the provider's developer
  // portal — this server doesn't know its own public URL, so it derives it
  // from the request itself (works whether reached via the ngrok tunnel or
  // a future real domain, as long as that host is what's registered).
  return `${req.protocol}://${req.get("host")}/api/oauth/${provider}/callback`;
}

router.get("/:provider/start", requireAuth, async (req, res) => {
  const { provider } = req.params;
  if (!PROVIDERS[provider]) return res.status(404).json({ error: "Unknown platform." });
  try {
    const authUrl = startAuth(provider, req.auth.sub, redirectUriFor(req, provider));
    res.json({ authUrl });
  } catch (err) {
    res.status(501).json({ error: err.message });
  }
});

router.get("/:provider/status", requireAuth, async (req, res) => {
  const { provider } = req.params;
  const data = load();
  const conn = data.platformConnections.find((c) => c.userId === req.auth.sub && c.provider === provider);
  res.json(conn ? { connected: true, username: conn.username, displayName: conn.displayName } : { connected: false });
});

router.delete("/:provider", requireAuth, async (req, res) => {
  const { provider } = req.params;
  const data = load();
  const before = data.platformConnections.length;
  data.platformConnections = data.platformConnections.filter(
    (c) => !(c.userId === req.auth.sub && c.provider === provider)
  );
  if (data.platformConnections.length !== before) await save(data);
  res.json({ ok: true });
});

function callbackPage(title, message) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
  <style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f1117;color:#eee}
  .box{text-align:center;max-width:360px;padding:24px}</style></head>
  <body><div class="box"><h2>${title}</h2><p>${message}</p><p>You can close this tab.</p></div></body></html>`;
}

/**
 * Real OAuth redirect target — the browser lands here directly from
 * X/TikTok's own servers, so there's no Authorization header to check;
 * the one-time `state` value (minted in /start, tied to the user who
 * requested it) is what proves who this callback belongs to.
 */
router.get("/:provider/callback", async (req, res) => {
  const { provider } = req.params;
  const { code, state, error: providerError } = req.query;
  const label = PROVIDERS[provider]?.label || provider;

  if (providerError) {
    return res.status(400).send(callbackPage(`${label} connection cancelled`, String(providerError)));
  }
  if (!code || !state) {
    return res.status(400).send(callbackPage("Connection failed", "Missing code or state from the provider."));
  }

  const ctx = consumeState(String(state));
  if (!ctx || ctx.provider !== provider) {
    return res.status(400).send(callbackPage("Connection expired", "That connection attempt expired or was already used. Please try again."));
  }

  try {
    const tokens = await exchangeCode(provider, String(code), ctx.codeVerifier, ctx.redirectUri);
    let profile = { externalId: null, username: `${label} account`, displayName: `${label} account` };
    try {
      profile = await fetchProfile(provider, tokens.access_token);
    } catch (err) {
      // Reading the connected user's own profile can be blocked by the
      // provider's API tier/billing independently of the OAuth handshake
      // itself — the connection is still real and the token still works
      // for whatever it IS authorized for, so this isn't fatal.
      console.warn(`[oauth] ${label} profile fetch failed (connection still saved):`, err.message);
    }

    const data = load();
    data.platformConnections = data.platformConnections.filter(
      (c) => !(c.userId === ctx.userId && c.provider === provider)
    );
    data.platformConnections.push({
      id: crypto.randomUUID(),
      userId: ctx.userId,
      provider,
      externalId: profile.externalId,
      username: profile.username,
      displayName: profile.displayName,
      accessToken: encryptSecret(tokens.access_token),
      refreshToken: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null,
      expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null,
      connectedAt: new Date().toISOString(),
    });
    await save(data);

    res.send(callbackPage(`${label} connected!`, `LinguaGuard is now connected as ${profile.displayName}.`));
  } catch (err) {
    console.error(`[oauth] ${label} token exchange failed:`, err.message);
    res.status(502).send(callbackPage("Connection failed", err.message));
  }
});

module.exports = router;
