const express = require("express");
const { authenticator } = require("otplib");
const qrcode = require("qrcode");
const { requireAuth, encryptSecret, decryptSecret } = require("../auth");
const { load, save } = require("../db");
const { verifyLimiter } = require("../rateLimit");

const router = express.Router();
router.use(requireAuth);

/**
 * Generates a new secret and returns it as a scannable QR code, but doesn't
 * turn 2FA on yet — that only happens once /confirm proves the user's
 * authenticator app actually has it (otherwise a bad scan/typo could lock
 * them out with a "working" secret nobody can actually generate codes from).
 */
router.post("/setup", async (req, res) => {
  const data = load();
  const user = data.users.find((u) => u.id === req.auth.sub);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.twoFactorEnabled) return res.status(400).json({ error: "Two-factor authentication is already enabled." });

  const secret = authenticator.generateSecret();
  user.twoFactorPendingSecret = encryptSecret(secret);
  await save(data);

  const otpauth = authenticator.keyuri(user.email, "LinguaGuard", secret);
  qrcode.toDataURL(otpauth, (err, qrDataUrl) => {
    if (err) return res.status(500).json({ error: "Failed to generate QR code." });
    res.json({ secret, qrDataUrl });
  });
});

router.post("/confirm", verifyLimiter, async (req, res) => {
  const { code } = req.body || {};
  const data = load();
  const user = data.users.find((u) => u.id === req.auth.sub);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (!user.twoFactorPendingSecret) {
    return res.status(400).json({ error: "Start setup first." });
  }

  const secret = decryptSecret(user.twoFactorPendingSecret);
  if (!code || !authenticator.verify({ token: String(code), secret })) {
    return res.status(400).json({ error: "Incorrect code. Check your authenticator app and try again." });
  }

  user.twoFactorSecret = user.twoFactorPendingSecret;
  user.twoFactorEnabled = true;
  delete user.twoFactorPendingSecret;
  await save(data);

  res.json({ ok: true });
});

router.post("/disable", verifyLimiter, async (req, res) => {
  const { code } = req.body || {};
  const data = load();
  const user = data.users.find((u) => u.id === req.auth.sub);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (!user.twoFactorEnabled) return res.status(400).json({ error: "Two-factor authentication isn't enabled." });

  const secret = decryptSecret(user.twoFactorSecret);
  if (!code || !authenticator.verify({ token: String(code), secret })) {
    return res.status(400).json({ error: "Incorrect code." });
  }

  user.twoFactorEnabled = false;
  delete user.twoFactorSecret;
  delete user.twoFactorPendingSecret;
  await save(data);

  res.json({ ok: true });
});

module.exports = router;
