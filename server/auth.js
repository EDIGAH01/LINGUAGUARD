const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { load, save } = require("./db");

// Dev-only fallback so the server still boots without a .env. This string is
// public (it's in the repo's source) — anyone who finds a deployment running
// without a real JWT_SECRET can forge tokens for any user, including admins.
const FALLBACK_SECRET = "dev-only-insecure-secret-change-me";
const JWT_SECRET = process.env.JWT_SECRET || FALLBACK_SECRET;
const TOKEN_TTL = "7d";

if (JWT_SECRET === FALLBACK_SECRET) {
  console.warn("─".repeat(60));
  console.warn("WARNING: JWT_SECRET is not set — using a public, hardcoded");
  console.warn("fallback secret. Anyone can forge admin tokens against this");
  console.warn("server. Set JWT_SECRET in .env before deploying anywhere");
  console.warn("reachable outside your own machine.");
  console.warn("─".repeat(60));
}

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

/**
 * tokenVersion is embedded so requireAuth can reject tokens issued before a
 * security-relevant change (password reset, ban) even though the JWT itself
 * is still cryptographically valid for up to 7 days. jti ties the token to a
 * specific row in data.sessions so an individual device can be signed out
 * without invalidating every other session (which is all tokenVersion can do).
 */
function signToken(user, jti) {
  return jwt.sign(
    { sub: user.id, role: user.role, tokenVersion: user.tokenVersion || 0, jti },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

/** Short-lived, single-purpose token proving password was correct while a TOTP code is still owed. */
function signPendingTwoFactorToken(user) {
  return jwt.sign({ sub: user.id, purpose: "2fa-pending" }, JWT_SECRET, { expiresIn: "5m" });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// AES-256-GCM at rest for TOTP secrets, keyed off JWT_SECRET so no extra env
// var is needed — same threat model as the rest of this file (compromising
// the server's secret already lets an attacker forge sessions outright).
const ENC_KEY = crypto.createHash("sha256").update(JWT_SECRET).digest();

function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, enc, tag].map((b) => b.toString("base64")).join(".");
}

function decryptSecret(blob) {
  const [ivB64, encB64, tagB64] = blob.split(".");
  const decipher = crypto.createDecipheriv("aes-256-gcm", ENC_KEY, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encB64, "base64")), decipher.final()]).toString("utf8");
}

function getTokenFromHeader(req) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  return scheme === "Bearer" && token ? token : null;
}

/**
 * Attaches req.auth = { sub, role } if a valid token is present. Beyond
 * cryptographic validity, this also re-checks the *current* user record on
 * every request: a JWT can otherwise stay valid for its full 7-day life
 * even after the account is banned or the password is reset (tokenVersion
 * bump), which would let a stolen or revoked-in-intent token keep working.
 */
function requireAuth(req, res, next) {
  const token = getTokenFromHeader(req);
  if (!token) return res.status(401).json({ error: "Not authenticated" });

  try {
    const payload = verifyToken(token);
    const data = load();
    const user = data.users.find((u) => u.id === payload.sub);

    if (!user) return res.status(401).json({ error: "Invalid or expired session" });
    if (user.status === "banned") {
      return res.status(403).json({ error: "This account has been suspended." });
    }
    if ((user.tokenVersion || 0) !== (payload.tokenVersion || 0)) {
      return res.status(401).json({ error: "Session expired — please sign in again." });
    }

    const session = data.sessions.find((s) => s.id === payload.jti && s.userId === user.id);
    if (!session || session.revoked) {
      return res.status(401).json({ error: "This session has been signed out." });
    }
    // Throttle the write — every authenticated request would otherwise
    // trigger a full save(), which is unnecessary disk churn for a timestamp
    // that only needs roughly-current precision.
    if (Date.now() - new Date(session.lastSeenAt).getTime() > 60_000) {
      session.lastSeenAt = new Date().toISOString();
      save(data);
    }

    // Use the live role, not whatever the token claimed at login time — an
    // admin demoted mid-session would otherwise keep admin access on their
    // existing token for up to 7 days.
    req.auth = { ...payload, role: user.role };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
}

/** Must run after requireAuth. */
function requireAdmin(req, res, next) {
  if (req.auth?.role !== "admin") {
    return res.status(403).json({ error: "Admin privileges required" });
  }
  next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  signToken,
  signPendingTwoFactorToken,
  verifyToken,
  requireAuth,
  requireAdmin,
  encryptSecret,
  decryptSecret,
};
