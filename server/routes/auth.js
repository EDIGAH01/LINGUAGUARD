const express = require("express");
const crypto = require("crypto");
const { authenticator } = require("otplib");
const { load, save } = require("../db");
const {
  hashPassword,
  verifyPassword,
  signToken,
  signPendingTwoFactorToken,
  verifyToken,
  requireAuth,
  decryptSecret,
} = require("../auth");
const { sendPasswordResetEmail } = require("../email");
const { sendPasswordResetSms, isChannelHealthy: smsChannelHealthy } = require("../sms");
const { normalizePhone } = require("../mpesa");
const { loginLimiter, signupLimiter, forgotPasswordLimiter, verifyLimiter } = require("../rateLimit");

const router = express.Router();

/**
 * A session row is what actually lets requireAuth revoke one device without
 * touching the rest (tokenVersion is the blunter, all-or-nothing version of
 * this used by password reset/ban). Device label is best-effort from the
 * user-agent — good enough to tell "Chrome on Windows" apart from "Safari on
 * iPhone" in the Settings UI, not meant to be a precise device fingerprint.
 */
function createSession(data, user, req) {
  const now = new Date().toISOString();
  const session = {
    id: crypto.randomUUID(),
    userId: user.id,
    device: describeUserAgent(req.get("user-agent") || ""),
    ip: req.ip,
    createdAt: now,
    lastSeenAt: now,
    revoked: false,
  };
  data.sessions.push(session);
  return session;
}

function describeUserAgent(ua) {
  const browser = /Edg\//.test(ua) ? "Edge"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Safari\//.test(ua) ? "Safari"
    : "Unknown browser";
  const os = /Windows/.test(ua) ? "Windows"
    : /Mac OS X/.test(ua) ? "macOS"
    : /Android/.test(ua) ? "Android"
    : /iPhone|iPad/.test(ua) ? "iOS"
    : /Linux/.test(ua) ? "Linux"
    : "Unknown device";
  return `${browser} · ${os}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_CODE_TTL_MS = 15 * 60 * 1000;
const RESET_MAX_ATTEMPTS = 5;

function toSafeUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone || "",
    role: u.role,
    plan: u.plan,
    status: u.status,
    createdAt: u.createdAt,
    twoFactorEnabled: Boolean(u.twoFactorEnabled),
  };
}

router.post("/signup", signupLimiter, (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !EMAIL_RE.test(email || "") || !password || password.length < 8) {
    return res.status(400).json({
      error: "Valid name, email, and a password of at least 8 characters are required.",
    });
  }

  const data = load();
  if (data.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: "An account with that email already exists." });
  }

  const user = {
    id: crypto.randomUUID(),
    name,
    email,
    phone: "",
    passwordHash: hashPassword(password),
    role: "user",
    plan: "free",
    status: "active",
    createdAt: new Date().toISOString(),
  };
  data.users.push(user);
  const session = createSession(data, user, req);
  save(data);

  res.status(201).json({ token: signToken(user, session.id), user: toSafeUser(user) });
});

router.post("/login", loginLimiter, (req, res) => {
  const { email, password } = req.body || {};
  const data = load();
  const user = data.users.find((u) => u.email.toLowerCase() === (email || "").toLowerCase());

  if (!user || !verifyPassword(password || "", user.passwordHash)) {
    return res.status(401).json({ error: "Invalid email or password." });
  }
  if (user.status === "banned") {
    return res.status(403).json({ error: "This account has been suspended." });
  }

  if (user.twoFactorEnabled) {
    return res.json({ requires2FA: true, pendingToken: signPendingTwoFactorToken(user) });
  }

  const session = createSession(data, user, req);
  save(data);
  res.json({ token: signToken(user, session.id), user: toSafeUser(user) });
});

router.post("/login/2fa", loginLimiter, (req, res) => {
  const { pendingToken, code } = req.body || {};
  if (!pendingToken || !code) {
    return res.status(400).json({ error: "pendingToken and code are required." });
  }

  let payload;
  try {
    payload = verifyToken(pendingToken);
  } catch {
    return res.status(401).json({ error: "That verification step expired. Please sign in again." });
  }
  if (payload.purpose !== "2fa-pending") {
    return res.status(401).json({ error: "That verification step expired. Please sign in again." });
  }

  const data = load();
  const user = data.users.find((u) => u.id === payload.sub);
  if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
    return res.status(401).json({ error: "That verification step expired. Please sign in again." });
  }
  if (user.status === "banned") {
    return res.status(403).json({ error: "This account has been suspended." });
  }

  const secret = decryptSecret(user.twoFactorSecret);
  if (!authenticator.verify({ token: String(code), secret })) {
    return res.status(401).json({ error: "Incorrect verification code." });
  }

  const session = createSession(data, user, req);
  save(data);
  res.json({ token: signToken(user, session.id), user: toSafeUser(user) });
});

router.post("/logout", requireAuth, (req, res) => {
  const data = load();
  const session = data.sessions.find((s) => s.id === req.auth.jti);
  if (session) {
    session.revoked = true;
    save(data);
  }
  res.json({ ok: true });
});

router.get("/sessions", requireAuth, (req, res) => {
  const data = load();
  const sessions = data.sessions
    .filter((s) => s.userId === req.auth.sub && !s.revoked)
    .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())
    .map((s) => ({ ...s, current: s.id === req.auth.jti }));
  res.json({ sessions });
});

router.delete("/sessions/:id", requireAuth, (req, res) => {
  const data = load();
  const session = data.sessions.find((s) => s.id === req.params.id && s.userId === req.auth.sub);
  if (!session) return res.status(404).json({ error: "Session not found." });
  session.revoked = true;
  save(data);
  res.json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => {
  const data = load();
  const user = data.users.find((u) => u.id === req.auth.sub);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user: toSafeUser(user) });
});

router.patch("/me", requireAuth, (req, res) => {
  const { name, phone } = req.body || {};
  const data = load();
  const user = data.users.find((u) => u.id === req.auth.sub);
  if (!user) return res.status(404).json({ error: "User not found" });

  if (typeof name === "string" && name.trim()) user.name = name.trim();
  if (typeof phone === "string") user.phone = phone;
  save(data);

  res.json({ user: toSafeUser(user) });
});

/**
 * Proactive, authenticated password change — distinct from the
 * forgot-password flow (which assumes the account may be compromised and
 * logs out every session). Here the user already proved who they are twice
 * (current session + current password), so only OTHER sessions get
 * invalidated; the current tab is handed a fresh token for the same session
 * so changing your password doesn't also log you out of the page you did it from.
 */
router.post("/change-password", verifyLimiter, requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: "Current password and a new password of at least 8 characters are required." });
  }

  const data = load();
  const user = data.users.find((u) => u.id === req.auth.sub);
  if (!user) return res.status(404).json({ error: "User not found" });

  if (!verifyPassword(currentPassword, user.passwordHash)) {
    return res.status(401).json({ error: "Current password is incorrect." });
  }

  user.passwordHash = hashPassword(newPassword);
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  data.sessions
    .filter((s) => s.userId === user.id && s.id !== req.auth.jti)
    .forEach((s) => { s.revoked = true; });
  save(data);

  res.json({ token: signToken(user, req.auth.jti), user: toSafeUser(user) });
});

const { PLAN_PRIORITY } = require("../plans");

/**
 * Self-service plan changes. Admins can set anything freely. Non-admins can
 * only downgrade here — an upgrade must go through a verified M-Pesa payment
 * (granted server-side in server/index.js once Safaricom confirms success),
 * not this endpoint, which would otherwise let anyone grant themselves any
 * plan with a single unauthenticated-of-payment API call.
 */
router.patch("/me/plan", requireAuth, (req, res) => {
  const { plan } = req.body || {};
  if (!["free", "pro", "enterprise"].includes(plan)) {
    return res.status(400).json({ error: "plan must be free, pro, or enterprise" });
  }

  const data = load();
  const user = data.users.find((u) => u.id === req.auth.sub);
  if (!user) return res.status(404).json({ error: "User not found" });

  if (user.role !== "admin" && PLAN_PRIORITY[plan] > PLAN_PRIORITY[user.plan]) {
    return res.status(402).json({ error: "Upgrading a plan requires payment. Use the M-Pesa upgrade flow." });
  }

  user.plan = plan;
  save(data);
  res.json({ user: toSafeUser(user) });
});

/**
 * Always responds with the same generic message regardless of whether the
 * email exists (or, for SMS, whether the typed phone actually matches the
 * one on file) — otherwise this endpoint would let anyone probe account
 * existence (user enumeration).
 *
 * The SMS phone number is user-supplied (so the UI can prompt for it), but
 * it's only ever used to CONFIRM the phone already on the account — it must
 * match, or nothing is sent. Sending to whatever number is typed, with no
 * check, would let anyone who knows a target's email redirect that
 * account's reset code to a phone they control.
 */
router.post("/forgot-password", forgotPasswordLimiter, async (req, res) => {
  const { email, method, phone } = req.body || {};
  const deliveryMethod = method === "sms" ? "sms" : "email";
  const generic = {
    message:
      deliveryMethod === "sms"
        ? "If that phone number matches the one on file for that account, we've sent a code via SMS."
        : "If that email has an account, we've sent a reset code to it.",
  };

  // Checked BEFORE any account lookup, deliberately. The answer depends only
  // on our own provider state — an unapproved sender ID or an empty balance
  // fails identically for every recipient — so it reveals nothing about
  // whether this email or phone belongs to a real account. Doing it here is
  // what keeps "tell the user the truth" from turning the status code into an
  // enumeration oracle: an attacker probing phone numbers gets the same 503
  // whether or not they guessed right.
  if (deliveryMethod === "sms" && !smsChannelHealthy()) {
    return res.status(503).json({
      error: "SMS delivery is unavailable right now. Please reset by email instead.",
    });
  }

  if (!EMAIL_RE.test(email || "")) return res.json(generic);

  const data = load();
  const user = data.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return res.json(generic);

  let normalizedTypedPhone = null;
  let normalizedStoredPhone = null;
  if (deliveryMethod === "sms") {
    if (!user.phone || !phone) return res.json(generic);
    try {
      normalizedTypedPhone = normalizePhone(phone);
      normalizedStoredPhone = normalizePhone(user.phone);
    } catch {
      return res.json(generic);
    }
    if (normalizedTypedPhone !== normalizedStoredPhone) return res.json(generic);
  }

  const code = crypto.randomInt(100000, 999999).toString();
  user.resetCode = { code, expiresAt: Date.now() + RESET_CODE_TTL_MS, attempts: 0 };
  save(data);

  try {
    if (deliveryMethod === "sms") {
      await sendPasswordResetSms(normalizedStoredPhone, code);
    } else {
      await sendPasswordResetEmail(user.email, code);
    }
  } catch (err) {
    console.error(`[auth] failed to send reset ${deliveryMethod}:`, err.message);

    // Delivery genuinely failed, so the code in the DB was never received by
    // anyone — drop it rather than leaving a live credential nobody can use.
    delete user.resetCode;
    save(data);

    // Still the generic response here, on purpose. By this point we've already
    // confirmed the account exists (and, for SMS, that the phone matches), so
    // a distinct error would tell an attacker exactly that. sendSms has now
    // marked the channel unhealthy, so the *next* request is rejected up-front
    // by the pre-lookup check above — which is where the user gets told the
    // truth, without the answer depending on their input.
  }

  res.json(generic);
});

router.post("/reset-password", verifyLimiter, (req, res) => {
  const { email, code, newPassword } = req.body || {};

  if (!EMAIL_RE.test(email || "") || !code || !newPassword || newPassword.length < 8) {
    return res.status(400).json({
      error: "Email, code, and a new password of at least 8 characters are required.",
    });
  }

  const data = load();
  const user = data.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user || !user.resetCode) {
    return res.status(400).json({ error: "Invalid or expired code." });
  }

  if (Date.now() > user.resetCode.expiresAt) {
    delete user.resetCode;
    save(data);
    return res.status(400).json({ error: "This code has expired. Request a new one." });
  }

  if (user.resetCode.attempts >= RESET_MAX_ATTEMPTS) {
    delete user.resetCode;
    save(data);
    return res.status(400).json({ error: "Too many incorrect attempts. Request a new code." });
  }

  if (user.resetCode.code !== code) {
    user.resetCode.attempts += 1;
    save(data);
    return res.status(400).json({ error: "Incorrect code." });
  }

  user.passwordHash = hashPassword(newPassword);
  user.tokenVersion = (user.tokenVersion || 0) + 1; // invalidate any already-issued sessions
  data.sessions.filter((s) => s.userId === user.id).forEach((s) => { s.revoked = true; });
  delete user.resetCode;
  save(data);

  res.json({ ok: true });
});

module.exports = { router, toSafeUser };
