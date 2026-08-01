const express = require("express");
const crypto = require("crypto");
const { requireAuth } = require("../auth");
const { load, save } = require("../db");

const router = express.Router();

const hashKey = (key) => crypto.createHash("sha256").update(key).digest("hex");

function toSafeKey(k) {
  return { id: k.id, label: k.label, prefix: k.prefix, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt || null };
}

router.get("/", requireAuth, (req, res) => {
  const data = load();
  const keys = data.apiKeys.filter((k) => k.userId === req.auth.sub);
  res.json({ keys: keys.map(toSafeKey) });
});

// Generates a real credential (crypto-random, stored only as a salted-free
// sha256 hash — same "never store the secret itself" rule as password
// hashing). The raw key is only ever returned here, once.
router.post("/", requireAuth, (req, res) => {
  const { label } = req.body || {};
  const raw = `lg_live_${crypto.randomBytes(24).toString("base64url")}`;
  const key = {
    id: crypto.randomUUID(),
    userId: req.auth.sub,
    label: typeof label === "string" && label.trim() ? label.trim() : "Untitled key",
    prefix: raw.slice(0, 12),
    keyHash: hashKey(raw),
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };

  const data = load();
  data.apiKeys.push(key);
  save(data);

  res.status(201).json({ key: toSafeKey(key), rawKey: raw });
});

router.delete("/:id", requireAuth, (req, res) => {
  const data = load();
  const key = data.apiKeys.find((k) => k.id === req.params.id && k.userId === req.auth.sub);
  if (!key) return res.status(404).json({ error: "API key not found." });
  data.apiKeys = data.apiKeys.filter((k) => k.id !== key.id);
  save(data);
  res.json({ ok: true });
});

/**
 * Proves the issued key is a genuine, independently-usable credential rather
 * than a decorative string: authenticates via the key itself (no JWT),
 * confirming the whole issue → hash → verify → revoke lifecycle actually works.
 */
router.get("/whoami", (req, res) => {
  const header = req.get("X-API-Key");
  if (!header) return res.status(401).json({ error: "Missing X-API-Key header." });

  const data = load();
  const key = data.apiKeys.find((k) => k.keyHash === hashKey(header));
  if (!key) return res.status(401).json({ error: "Invalid or revoked API key." });

  // An API key authenticates by its own hash without ever consulting the user
  // record, so without this a banned account's key keeps working indefinitely
  // — the one auth path that bypassed the ban check requireAuth enforces.
  const user = data.users.find((u) => u.id === key.userId);
  if (!user) return res.status(401).json({ error: "Invalid or revoked API key." });
  if (user.status === "banned") {
    return res.status(403).json({ error: "This account has been suspended." });
  }

  key.lastUsedAt = new Date().toISOString();
  save(data);

  res.json({ label: key.label, createdAt: key.createdAt, account: user.email });
});

module.exports = router;
