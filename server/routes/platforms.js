const express = require("express");
const crypto = require("crypto");
const { requireAuth } = require("../auth");
const { load, save } = require("../db");
const { normalizePhone } = require("../mpesa");
const { sendPlatformVerificationSms } = require("../sms");
const { forgotPasswordLimiter, verifyLimiter } = require("../rateLimit");
const telegram = require("../telegram");

const router = express.Router();

router.use(requireAuth);

const PHONE_CODE_TTL_MS = 10 * 60 * 1000;
const PHONE_MAX_ATTEMPTS = 5;

// Telegram is the one platform here that can be made genuinely real without
// waiting on a third-party app-review process — it only needs a bot token.
// Everything else (Instagram/Facebook/WhatsApp/TikTok/YouTube/etc.) requires
// a developer app registered directly with that platform, and for
// Meta/TikTok specifically, a business-verification + app-review process
// only the account owner can start. Those stay as the existing simulated
// demo flow in the frontend until real credentials are supplied.

router.get("/telegram/status", async (req, res) => {
  res.json(telegram.getStatus(req.auth.sub));
});

router.post("/telegram/start", async (req, res) => {
  if (!telegram.isConfigured()) {
    return res.status(501).json({
      error:
        "Telegram isn't configured on this server yet. Create a bot via @BotFather and set TELEGRAM_BOT_TOKEN / TELEGRAM_BOT_USERNAME in .env.",
    });
  }
  res.json(await telegram.startVerification(req.auth.sub));
});

router.get("/telegram/groups", async (req, res) => {
  res.json({ groups: telegram.getGroupLinks(req.auth.sub) });
});

router.post("/telegram/group/start", async (req, res) => {
  if (!telegram.isConfigured()) {
    return res.status(501).json({
      error:
        "Telegram isn't configured on this server yet. Create a bot via @BotFather and set TELEGRAM_BOT_TOKEN / TELEGRAM_BOT_USERNAME in .env.",
    });
  }
  res.json(await telegram.startGroupVerification(req.auth.sub));
});

/**
 * Phone-based platform connect flow (WhatsApp, and any other platform with
 * authMethod "phone"). Replaces the old client-side "generate a code and
 * display it in the UI" demo — the code now only ever exists server-side
 * and over SMS, same as password reset.
 */
router.post("/phone/start", forgotPasswordLimiter, async (req, res) => {
  const { platformId, phone, platformName } = req.body || {};
  if (!platformId || !phone) {
    return res.status(400).json({ error: "platformId and phone are required" });
  }

  let normalizedPhone;
  try {
    normalizedPhone = normalizePhone(phone);
  } catch {
    return res.status(400).json({ error: "That doesn't look like a valid phone number." });
  }

  const data = load();
  data.phoneVerifications = data.phoneVerifications.filter(
    (v) => !(v.userId === req.auth.sub && v.platformId === platformId)
  );

  const code = crypto.randomInt(100000, 999999).toString();
  data.phoneVerifications.push({
    userId: req.auth.sub,
    platformId,
    phone: normalizedPhone,
    code,
    expiresAt: Date.now() + PHONE_CODE_TTL_MS,
    attempts: 0,
  });
  await save(data);

  try {
    // The WhatsApp platform's code goes over WhatsApp itself (Termii
    // whatsapp channel) when available, falling back to SMS inside sms.js.
    await sendPlatformVerificationSms(normalizedPhone, code, platformName || platformId, {
      viaWhatsApp: platformId === "whatsapp",
    });
  } catch (err) {
    console.error("[platforms] failed to send phone verification code:", err.message);
    return res.status(502).json({ error: "Failed to send verification code. Please try again." });
  }

  res.json({ message: `Verification code sent to ${phone}.` });
});

router.post("/phone/verify", verifyLimiter, async (req, res) => {
  const { platformId, phone, code } = req.body || {};
  if (!platformId || !phone || !code) {
    return res.status(400).json({ error: "platformId, phone, and code are required" });
  }

  let normalizedPhone;
  try {
    normalizedPhone = normalizePhone(phone);
  } catch {
    return res.status(400).json({ error: "That doesn't look like a valid phone number." });
  }

  const data = load();
  const entry = data.phoneVerifications.find(
    (v) => v.userId === req.auth.sub && v.platformId === platformId && v.phone === normalizedPhone
  );

  if (!entry) return res.status(400).json({ error: "Request a new code first." });

  if (Date.now() > entry.expiresAt) {
    data.phoneVerifications = data.phoneVerifications.filter((v) => v !== entry);
    await save(data);
    return res.status(400).json({ error: "This code has expired. Request a new one." });
  }

  if (entry.attempts >= PHONE_MAX_ATTEMPTS) {
    data.phoneVerifications = data.phoneVerifications.filter((v) => v !== entry);
    await save(data);
    return res.status(400).json({ error: "Too many incorrect attempts. Request a new code." });
  }

  if (entry.code !== code) {
    entry.attempts += 1;
    await save(data);
    return res.status(400).json({ error: "Incorrect code." });
  }

  data.phoneVerifications = data.phoneVerifications.filter((v) => v !== entry);
  await save(data);
  res.json({ ok: true });
});

module.exports = router;
