const { sendAlertEmail } = require("./email");
const { sendAlertSms } = require("./sms");
const { normalizePhone } = require("./mpesa");

// Must stay in sync with the ids in src/pages/Settings.tsx notificationSettings.
const DEFAULT_PREFS = {
  email_blocked: true,
  email_flagged: false,
  sms_critical: true,
  weekly_digest: true,
};

/** A user's effective preferences: stored values over defaults. */
function getPrefs(user) {
  return { ...DEFAULT_PREFS, ...(user.notificationPrefs || {}) };
}

// A burst of violations (someone spamming a monitored group) shouldn't turn
// into a burst of emails/SMS — one alert per user per channel per minute is
// enough to know something's happening; the Activity page has the full list.
const COOLDOWN_MS = 60_000;
const lastAlertAt = new Map();

function underCooldown(userId, channel) {
  const key = `${userId}:${channel}`;
  const last = lastAlertAt.get(key) || 0;
  if (Date.now() - last < COOLDOWN_MS) return true;
  lastAlertAt.set(key, Date.now());
  return false;
}

/**
 * The real trigger behind the Settings notification toggles: called from
 * every scan path (manual test-scanner, Telegram DMs/groups) after an event
 * is recorded. Fire-and-forget — a mail/SMS provider outage must never break
 * or slow the scan itself.
 */
function dispatchAlerts(user, event) {
  if (!user || event.status === "allowed") return;
  const prefs = getPrefs(user);

  const emailWanted =
    (event.status === "blocked" && prefs.email_blocked) ||
    (event.status === "flagged" && prefs.email_flagged);
  if (emailWanted && !underCooldown(user.id, "email")) {
    sendAlertEmail(user.email, event).catch((err) =>
      console.error("[alerts] alert email failed:", err.message)
    );
  }

  if (event.severity === "high" && prefs.sms_critical && user.phone) {
    if (!underCooldown(user.id, "sms")) {
      try {
        sendAlertSms(normalizePhone(user.phone), event).catch((err) =>
          console.error("[alerts] alert sms failed:", err.message)
        );
      } catch (err) {
        console.error("[alerts] invalid phone for sms alert:", err.message);
      }
    }
  }
}

module.exports = { dispatchAlerts, getPrefs, DEFAULT_PREFS };
