const rateLimit = require("express-rate-limit");

const message = { error: "Too many requests. Please wait a few minutes and try again." };

/** Login: generous enough for real typos, tight enough to block brute-forcing a password. */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message,
});

/** Signup: stops automated mass account creation. */
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message,
});

/** Forgot-password: the per-code max-attempts counter guards guessing, but
 *  nothing else stopped someone from requesting unlimited new codes — each
 *  one is a real email/SMS send, so this is also a cost/spam control. */
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message,
});

/** Code-verification endpoints: the stored per-code attempt counters are the
 *  primary defense; this is a coarser IP-level backstop against automation. */
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message,
});

module.exports = { loginLimiter, signupLimiter, forgotPasswordLimiter, verifyLimiter };
