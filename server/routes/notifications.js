const express = require("express");
const { requireAuth } = require("../auth");
const { load, save } = require("../db");
const { sendTestEmail } = require("../email");
const { sendTestSms } = require("../sms");
const { normalizePhone } = require("../mpesa");
const { verifyLimiter } = require("../rateLimit");
const { getPrefs, DEFAULT_PREFS } = require("../alerts");

const router = express.Router();
router.use(requireAuth);

/**
 * Notification preferences live server-side (not localStorage) because the
 * scan engine — which runs with no browser involved at all for Telegram
 * messages — is what has to honor them when deciding whether to send a real
 * email/SMS alert.
 */
router.get("/prefs", (req, res) => {
  const data = load();
  const user = data.users.find((u) => u.id === req.auth.sub);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ prefs: getPrefs(user) });
});

router.patch("/prefs", (req, res) => {
  const body = req.body || {};
  const validKeys = Object.keys(DEFAULT_PREFS);
  const updates = {};
  for (const [key, value] of Object.entries(body)) {
    if (!validKeys.includes(key)) return res.status(400).json({ error: `Unknown preference: ${key}` });
    if (typeof value !== "boolean") return res.status(400).json({ error: `${key} must be true or false` });
    updates[key] = value;
  }

  const data = load();
  const user = data.users.find((u) => u.id === req.auth.sub);
  if (!user) return res.status(404).json({ error: "User not found" });

  user.notificationPrefs = { ...getPrefs(user), ...updates };
  save(data);
  res.json({ prefs: getPrefs(user) });
});

/**
 * Sends a real test alert over the given channel to the authenticated
 * user's own email/phone, using the same email/SMS infrastructure as
 * password reset and phone verification. There's no live content-scanning
 * pipeline in this app for "email on blocked content" etc. to genuinely
 * trigger from — this proves the channel itself actually delivers, rather
 * than the notification toggle being a preference with nothing behind it.
 */
router.post("/test", verifyLimiter, async (req, res) => {
  const { channel, label } = req.body || {};
  if (!["email", "sms"].includes(channel)) {
    return res.status(400).json({ error: "channel must be 'email' or 'sms'" });
  }

  const data = load();
  const user = data.users.find((u) => u.id === req.auth.sub);
  if (!user) return res.status(404).json({ error: "User not found" });

  const notificationLabel = typeof label === "string" && label.trim() ? label.trim() : "Test notification";

  try {
    if (channel === "email") {
      await sendTestEmail(user.email, notificationLabel);
      return res.json({ message: `Test email sent to ${user.email}.` });
    }

    if (!user.phone) {
      return res.status(400).json({ error: "Add a phone number in your profile first." });
    }
    const normalizedPhone = normalizePhone(user.phone);
    await sendTestSms(normalizedPhone, notificationLabel);
    res.json({ message: `Test SMS sent to ${user.phone}.` });
  } catch (err) {
    console.error("[notifications] test send failed:", err.message);
    res.status(502).json({ error: "Failed to send test alert. Please try again." });
  }
});

module.exports = router;
