const { load, getKv, setKv } = require("./db");
const { sendWeeklyDigestEmail } = require("./email");
const { getPrefs } = require("./alerts");

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly tick; per-user timing lives in kv_store

/**
 * The real job behind the "Weekly digest report" toggle. Hourly sweep; each
 * opted-in user gets a digest once their own 7-day clock elapses. The clock
 * starts at the first sweep after signup (baseline write, no email) so a
 * brand-new user's first digest arrives a week in, not seconds after joining.
 * Users whose week had zero activity are skipped — an all-zeroes digest is
 * noise. Timing state is in kv_store, so restarts don't reset anyone's clock.
 */
async function runDigestSweep(now = Date.now()) {
  const data = load();

  for (const user of data.users) {
    if (user.status === "banned") continue;
    if (!getPrefs(user).weekly_digest) continue;

    const key = `digest_last_${user.id}`;
    const last = Number(getKv(key) || 0);
    if (!last) {
      setKv(key, String(now));
      continue;
    }
    if (now - last < WEEK_MS) continue;

    const since = now - WEEK_MS;
    const events = data.activityEvents.filter(
      (e) => e.userId === user.id && new Date(e.timestamp).getTime() >= since
    );

    setKv(key, String(now));
    if (events.length === 0) continue;

    const stats = {
      total: events.length,
      blocked: events.filter((e) => e.status === "blocked").length,
      flagged: events.filter((e) => e.status === "flagged").length,
      allowed: events.filter((e) => e.status === "allowed").length,
    };

    try {
      await sendWeeklyDigestEmail(user.email, stats);
      console.log(`[digest] Weekly digest sent to ${user.email} (${stats.total} events).`);
    } catch (err) {
      console.error(`[digest] Failed to send digest to ${user.email}:`, err.message);
    }
  }
}

function startDigestScheduler() {
  // First sweep shortly after boot records baselines for anyone new.
  setTimeout(() => runDigestSweep().catch((err) => console.error("[digest] sweep error:", err.message)), 10_000);
  setInterval(() => runDigestSweep().catch((err) => console.error("[digest] sweep error:", err.message)), CHECK_INTERVAL_MS);
}

module.exports = { runDigestSweep, startDigestScheduler };
