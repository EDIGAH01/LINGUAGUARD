const { load, save } = require("./db");
const { encryptSecret, decryptSecret } = require("./auth");
const { PROVIDERS, isConfigured, refreshAccessToken, extendMetaToken } = require("./oauth");
const { scanAndRecord } = require("./contentScanner");
const { dispatchAlerts } = require("./alerts");

/**
 * Automated content ingestion for the connected social platforms.
 *
 * Telegram already ingests live (server/telegram.js). This does the same for
 * the OAuth platforms: on a timer, for every stored platformConnection whose
 * provider has an adapter below, it uses the connection's OAuth token to pull
 * the newest comments/mentions, runs each through the SAME scanAndRecord engine
 * the manual scanner and Telegram use, fires the user's alerts, and — when a
 * verdict is "blocked" — pushes an enforcement action back to the platform
 * (hide/reject the comment) where the granted scope allows it.
 *
 * Design notes:
 *  - Fail-safe end to end. A provider erroring, rate-limiting, or lacking the
 *    API tier/approval only skips that one connection this tick; it never
 *    crashes the loop or the server. This mirrors the "wired, upgrades when the
 *    credentials/approval land" pattern used across the codebase.
 *  - Idempotent. Each connection carries a capped list of already-seen item ids
 *    (ingestState.seenIds); only unseen items are scanned, so restarts and
 *    overlapping ticks never double-record.
 *  - Token refresh. Google/X issue refresh tokens; an expired access token is
 *    refreshed transparently and the new one re-encrypted back onto the
 *    connection. Meta's long-lived tokens are used until they expire.
 */

const POLL_MS = Number(process.env.INGESTION_POLL_MS) || 60_000;
// On-platform enforcement (hiding/rejecting flagged content) is real and
// destructive, so it's gated. Defaults ON — the requested behaviour — but can
// be disabled with INGESTION_ENFORCE=false without touching ingestion itself.
const ENFORCE = process.env.INGESTION_ENFORCE !== "false";
const SEEN_CAP = 500;
const MAX_ITEMS_PER_TICK = 25;
// Meta tokens (~60d) have no refresh_token — re-exchange them while still valid
// once they're within a week of expiry, rolling the window forward.
const META_RENEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const j = (res) => res.json().catch(() => ({}));

// ─── Per-provider adapters ──────────────────────────────────────────────────
// Each adapter maps an OAuth provider to:
//   platformId   – the Connections platform id used for stats/Activity grouping
//                  (note: provider "x" surfaces as platform "twitter").
//   platformName – display label on the Activity feed.
//   fetchItems   – pull recent items → [{ externalId, sender, content }].
//   enforce      – (optional) act on a blocked item on-platform.

const adapters = {
  youtube: {
    platformId: "youtube",
    platformName: "YouTube",
    async fetchItems(conn, token) {
      // Every top-level comment across the connected channel, newest first.
      const url =
        `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet` +
        `&allThreadsRelatedToChannelId=${encodeURIComponent(conn.externalId)}` +
        `&order=time&maxResults=50&textFormat=plainText`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`commentThreads HTTP ${res.status}`);
      const data = await j(res);
      return (data.items || []).map((it) => {
        const c = it.snippet.topLevelComment;
        return { externalId: c.id, sender: c.snippet.authorDisplayName || "YouTube user", content: c.snippet.textDisplay || "" };
      });
    },
    async enforce(conn, token, item, event) {
      // Reject a blocked comment; hold a flagged one for the owner's review.
      const status = event.status === "blocked" ? "rejected" : "heldForReview";
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/comments/setModerationStatus?id=${encodeURIComponent(item.externalId)}&moderationStatus=${status}`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error(`setModerationStatus HTTP ${res.status}`);
    },
  },

  x: {
    platformId: "twitter",
    platformName: "X / Twitter",
    async fetchItems(conn, token) {
      // Recent @-mentions of the connected user.
      const url =
        `https://api.x.com/2/users/${encodeURIComponent(conn.externalId)}/mentions` +
        `?max_results=25&tweet.fields=author_id&expansions=author_id&user.fields=username`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`mentions HTTP ${res.status}`);
      const data = await j(res);
      const users = Object.fromEntries((data.includes?.users || []).map((u) => [u.id, u.username]));
      return (data.data || []).map((t) => ({
        externalId: t.id,
        sender: users[t.author_id] ? `@${users[t.author_id]}` : "X user",
        content: t.text || "",
      }));
    },
    async enforce(conn, token, item /*, event */) {
      // X only lets an author hide REPLIES to their own tweets; attempt it and
      // let a 403 (not a reply we own) fall through to the fail-safe logger.
      const res = await fetch(`https://api.x.com/2/tweets/${encodeURIComponent(item.externalId)}/hidden`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ hidden: true }),
      });
      if (!res.ok) throw new Error(`hide reply HTTP ${res.status}`);
    },
  },

  instagram: {
    platformId: "instagram",
    platformName: "Instagram",
    async fetchItems(conn, token) {
      // Comments on the account's most recent media. externalId here is the IG
      // business account id (from the OAuth profile fetch).
      const mediaRes = await fetch(
        `https://graph.facebook.com/v21.0/${encodeURIComponent(conn.externalId)}/media?fields=id&limit=5&access_token=${token}`
      );
      if (!mediaRes.ok) throw new Error(`media HTTP ${mediaRes.status}`);
      const media = (await j(mediaRes)).data || [];
      const items = [];
      for (const m of media) {
        const cRes = await fetch(
          `https://graph.facebook.com/v21.0/${m.id}/comments?fields=id,text,username&access_token=${token}`
        );
        if (!cRes.ok) continue;
        for (const c of (await j(cRes)).data || []) {
          items.push({ externalId: c.id, sender: c.username ? `@${c.username}` : "Instagram user", content: c.text || "" });
        }
      }
      return items;
    },
    async enforce(conn, token, item /*, event */) {
      const res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(item.externalId)}?access_token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hide: true }),
      });
      if (!res.ok) throw new Error(`hide comment HTTP ${res.status}`);
    },
  },

  facebook: {
    platformId: "facebook",
    platformName: "Facebook",
    async fetchItems(conn, token) {
      // Page comments require a Page access token, not the user token — resolve
      // the first managed Page and use its token for both read and enforce.
      const page = await resolveFacebookPage(conn, token);
      if (!page) return [];
      conn._pageToken = page.access_token; // stashed for enforce() this tick
      const feedRes = await fetch(
        `https://graph.facebook.com/v21.0/${page.id}/feed?fields=comments{id,message,from}&limit=10&access_token=${page.access_token}`
      );
      if (!feedRes.ok) throw new Error(`feed HTTP ${feedRes.status}`);
      const items = [];
      for (const post of (await j(feedRes)).data || []) {
        for (const c of post.comments?.data || []) {
          if (!c.message) continue;
          items.push({ externalId: c.id, sender: c.from?.name || "Facebook user", content: c.message });
        }
      }
      return items;
    },
    async enforce(conn, token, item /*, event */) {
      const pageToken = conn._pageToken || token;
      const res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(item.externalId)}?access_token=${pageToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_hidden: true }),
      });
      if (!res.ok) throw new Error(`hide comment HTTP ${res.status}`);
    },
  },

  tiktok: {
    platformId: "tiktok",
    platformName: "TikTok",
    async fetchItems(/* conn, token */) {
      // TikTok's public API (Login Kit + Display API) exposes profile and the
      // user's own videos, but NOT a comment-read endpoint for third-party
      // apps — comment moderation is only available to approved partners under
      // a separate program. So there's nothing to ingest with the granted
      // scope; return empty rather than pretend. The adapter stays registered
      // so the moment TikTok grants comment access, only this method changes.
      return [];
    },
  },
};

/** Resolves the first Facebook Page the user manages, with its Page token. */
async function resolveFacebookPage(conn, userToken) {
  const res = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token&access_token=${userToken}`
  );
  if (!res.ok) return null;
  const data = await j(res);
  return data.data?.[0] || null;
}

// ─── Poll loop ──────────────────────────────────────────────────────────────

/**
 * Ensures the connection has a usable access token, refreshing if expired and
 * a refresh token is available. Mutates `conn` (new encrypted token/expiry) and
 * flags whether the caller must persist. Returns the plaintext token, or null
 * if it can't produce a valid one.
 */
async function tokenFor(conn) {
  let current;
  try {
    current = decryptSecret(conn.accessToken);
  } catch {
    return null; // corrupt/rotated encryption key — skip
  }
  const now = Date.now();
  const expiresAt = conn.expiresAt || 0;

  // Meta providers (Instagram/Facebook): no refresh_token — re-exchange the
  // still-valid token for a fresh ~60-day one once it's inside the renew window.
  if (PROVIDERS[conn.provider]?.meta) {
    const nearExpiry = expiresAt && now > expiresAt - META_RENEW_WINDOW_MS;
    const dead = expiresAt && now >= expiresAt;
    if (dead) return null; // fully expired — the user must reconnect
    if (nearExpiry) {
      try {
        const ext = await extendMetaToken(conn.provider, current);
        if (ext?.access_token) {
          conn.accessToken = encryptSecret(ext.access_token);
          conn.expiresAt = ext.expires_in ? now + ext.expires_in * 1000 : null;
          return { token: ext.access_token, changed: true };
        }
      } catch (err) {
        console.warn(`[ingest] ${conn.provider}: Meta token renewal failed: ${err.message}`);
      }
    }
    return { token: current, changed: false };
  }

  // Refresh-token providers (Google/X): swap an expired token for a new one.
  const expired = expiresAt && now > expiresAt - 60_000;
  if (!expired) return { token: current, changed: false };
  if (!conn.refreshToken) return null; // expired, nothing to refresh with
  const refreshed = await refreshAccessToken(conn.provider, decryptSecret(conn.refreshToken));
  if (!refreshed?.access_token) return null;
  conn.accessToken = encryptSecret(refreshed.access_token);
  if (refreshed.refresh_token) conn.refreshToken = encryptSecret(refreshed.refresh_token);
  conn.expiresAt = refreshed.expires_in ? now + refreshed.expires_in * 1000 : null;
  return { token: refreshed.access_token, changed: true };
}

async function ingestConnection(data, conn) {
  const adapter = adapters[conn.provider];
  if (!adapter || !isConfigured(conn.provider)) return false;

  const tok = await tokenFor(conn);
  if (!tok) {
    console.warn(`[ingest] ${conn.provider}: no usable token for connection ${conn.id} (expired without refresh?) — skipping.`);
    return false;
  }
  let changed = tok.changed;

  conn.ingestState = conn.ingestState || { seenIds: [] };
  const seen = new Set(conn.ingestState.seenIds);

  let items;
  try {
    items = await adapter.fetchItems(conn, tok.token);
  } catch (err) {
    console.warn(`[ingest] ${conn.provider}: fetch failed for connection ${conn.id}: ${err.message}`);
    return changed;
  }

  // Only genuinely new items, capped so one busy channel can't monopolise a tick.
  const fresh = items.filter((it) => it.externalId && it.content?.trim() && !seen.has(it.externalId)).slice(0, MAX_ITEMS_PER_TICK);

  for (const item of fresh) {
    const { event } = await scanAndRecord(data, {
      userId: conn.userId,
      platformId: adapter.platformId,
      platformName: adapter.platformName,
      sender: item.sender,
      content: item.content,
    });
    changed = true;
    seen.add(item.externalId);

    dispatchAlerts(data.users.find((u) => u.id === conn.userId), event);

    // Push the verdict back to the platform where we can act on it.
    if (ENFORCE && adapter.enforce && (event.status === "blocked" || event.status === "flagged")) {
      try {
        await adapter.enforce(conn, tok.token, item, event);
        console.log(`[ingest] ${conn.provider}: enforced "${event.status}" on item ${item.externalId}`);
      } catch (err) {
        console.warn(`[ingest] ${conn.provider}: enforcement failed for ${item.externalId}: ${err.message}`);
      }
    }
  }

  if (fresh.length) {
    // Keep the seen list bounded — newest ids win.
    conn.ingestState.seenIds = [...seen].slice(-SEEN_CAP);
    conn.ingestState.lastPolledAt = new Date().toISOString();
  }
  delete conn._pageToken; // never persist the transient Page token
  return changed;
}

let running = false;

async function pollAllOnce() {
  if (running) return;
  running = true;
  try {
    const data = load();
    const conns = (data.platformConnections || []).filter((c) => adapters[c.provider]);
    if (!conns.length) return;

    let changed = false;
    for (const conn of conns) {
      try {
        if (await ingestConnection(data, conn)) changed = true;
      } catch (err) {
        console.warn(`[ingest] connection ${conn.id} (${conn.provider}) errored: ${err.message}`);
      }
    }
    if (changed) save(data);
  } catch (err) {
    console.error("[ingest] poll error:", err.message);
  } finally {
    running = false;
  }
}

function startIngestion() {
  const providers = Object.keys(adapters).filter(isConfigured);
  if (!providers.length) {
    console.log("[ingest] no social providers configured — content ingestion idle (connect an account / set provider keys to enable).");
    return;
  }
  console.log(
    `[ingest] polling ${providers.join(", ")} every ${Math.round(POLL_MS / 1000)}s ` +
      `(on-platform enforcement ${ENFORCE ? "ON" : "OFF"}).`
  );
  setInterval(pollAllOnce, POLL_MS);
}

module.exports = { startIngestion, pollAllOnce, adapters };
