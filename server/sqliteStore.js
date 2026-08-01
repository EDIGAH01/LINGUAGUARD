const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH = path.join(__dirname, "database.db");
const LEGACY_JSON_PATH = path.join(__dirname, "db.json");
const SEED_CREDENTIALS_PATH = path.join(__dirname, ".seed-admin-credentials.txt");

const isNewDb = !fs.existsSync(DB_PATH);
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL DEFAULT '',
    passwordHash TEXT NOT NULL,
    role TEXT NOT NULL,
    plan TEXT NOT NULL,
    status TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    tokenVersion INTEGER NOT NULL DEFAULT 0,
    resetCode TEXT,
    twoFactorEnabled INTEGER NOT NULL DEFAULT 0,
    twoFactorSecret TEXT,
    twoFactorPendingSecret TEXT
  );

  CREATE TABLE IF NOT EXISTS platform_connections (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_platform_connections_user ON platform_connections(userId);

  CREATE TABLE IF NOT EXISTS telegram_links (
    rowid INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    code TEXT NOT NULL,
    verified INTEGER NOT NULL DEFAULT 0,
    createdAt INTEGER NOT NULL,
    chatId TEXT,
    telegramUsername TEXT,
    chatType TEXT,
    groupTitle TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_telegram_links_user ON telegram_links(userId);

  CREATE TABLE IF NOT EXISTS phone_verifications (
    rowid INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    platformId TEXT NOT NULL,
    phone TEXT NOT NULL,
    code TEXT NOT NULL,
    expiresAt INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_phone_verifications_user ON phone_verifications(userId);

  CREATE TABLE IF NOT EXISTS pending_payments (
    checkoutRequestId TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    plan TEXT NOT NULL,
    status TEXT NOT NULL,
    createdAt INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pending_payments_user ON pending_payments(userId);

  CREATE TABLE IF NOT EXISTS filter_rules (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    severity TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    keywords TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    matchCount INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_filter_rules_user ON filter_rules(userId);

  CREATE TABLE IF NOT EXISTS activity_events (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    platformId TEXT NOT NULL,
    platformName TEXT NOT NULL,
    status TEXT NOT NULL,
    content TEXT NOT NULL,
    ruleMatched TEXT NOT NULL,
    category TEXT NOT NULL,
    severity TEXT NOT NULL,
    sender TEXT NOT NULL,
    timestamp TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_activity_events_user ON activity_events(userId);
  CREATE INDEX IF NOT EXISTS idx_activity_events_timestamp ON activity_events(timestamp);

  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    label TEXT NOT NULL,
    prefix TEXT NOT NULL,
    keyHash TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    lastUsedAt TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(userId);

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    device TEXT NOT NULL,
    ip TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    lastSeenAt TEXT NOT NULL,
    revoked INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(userId);

  CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// CREATE TABLE IF NOT EXISTS doesn't add columns to a table that already
// existed under the old schema — this brings a pre-group-support database
// up to date in place, without needing a fresh migration or losing data.
{
  const existingColumns = new Set(db.prepare("PRAGMA table_info(telegram_links)").all().map((c) => c.name));
  if (!existingColumns.has("chatType")) db.exec("ALTER TABLE telegram_links ADD COLUMN chatType TEXT");
  if (!existingColumns.has("groupTitle")) db.exec("ALTER TABLE telegram_links ADD COLUMN groupTitle TEXT");

  const userColumns = new Set(db.prepare("PRAGMA table_info(users)").all().map((c) => c.name));
  if (!userColumns.has("notificationPrefs")) db.exec("ALTER TABLE users ADD COLUMN notificationPrefs TEXT");
}

function defaultData() {
  return {
    users: [],
    platformConnections: [],
    telegramLinks: [],
    phoneVerifications: [],
    pendingPayments: [],
    filterRules: [],
    activityEvents: [],
    apiKeys: [],
    sessions: [],
  };
}

function rowToUser(row) {
  const user = {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    passwordHash: row.passwordHash,
    role: row.role,
    plan: row.plan,
    status: row.status,
    createdAt: row.createdAt,
    tokenVersion: row.tokenVersion,
    twoFactorEnabled: Boolean(row.twoFactorEnabled),
  };
  if (row.resetCode) user.resetCode = JSON.parse(row.resetCode);
  if (row.twoFactorSecret) user.twoFactorSecret = row.twoFactorSecret;
  if (row.twoFactorPendingSecret) user.twoFactorPendingSecret = row.twoFactorPendingSecret;
  if (row.notificationPrefs) user.notificationPrefs = JSON.parse(row.notificationPrefs);
  return user;
}

/**
 * Reads the whole store into the same plain-object-of-arrays shape every
 * route file already works with — the SQLite migration changes what's under
 * the hood (real tables, real transactions, real indexes) without requiring
 * every route to be rewritten to issue its own queries.
 */
function load() {
  return {
    users: db.prepare("SELECT * FROM users").all().map(rowToUser),
    platformConnections: db.prepare("SELECT * FROM platform_connections").all().map((r) => JSON.parse(r.data)),
    telegramLinks: db.prepare("SELECT * FROM telegram_links ORDER BY rowid").all().map((r) => {
      const link = { userId: r.userId, code: r.code, verified: Boolean(r.verified), createdAt: r.createdAt };
      if (r.chatId !== null) link.chatId = Number(r.chatId);
      if (r.telegramUsername) link.telegramUsername = r.telegramUsername;
      if (r.chatType) link.chatType = r.chatType;
      if (r.groupTitle) link.groupTitle = r.groupTitle;
      return link;
    }),
    phoneVerifications: db.prepare("SELECT * FROM phone_verifications ORDER BY rowid").all().map((r) => ({
      userId: r.userId,
      platformId: r.platformId,
      phone: r.phone,
      code: r.code,
      expiresAt: r.expiresAt,
      attempts: r.attempts,
    })),
    pendingPayments: db.prepare("SELECT * FROM pending_payments").all().map((r) => ({
      checkoutRequestId: r.checkoutRequestId,
      userId: r.userId,
      plan: r.plan,
      status: r.status,
      createdAt: r.createdAt,
    })),
    filterRules: db.prepare("SELECT * FROM filter_rules").all().map((r) => ({
      id: r.id,
      userId: r.userId,
      name: r.name,
      category: r.category,
      severity: r.severity,
      enabled: Boolean(r.enabled),
      keywords: JSON.parse(r.keywords),
      description: r.description,
      matchCount: r.matchCount,
      createdAt: r.createdAt,
    })),
    activityEvents: db.prepare("SELECT * FROM activity_events").all().map((r) => ({
      id: r.id,
      userId: r.userId,
      platformId: r.platformId,
      platformName: r.platformName,
      status: r.status,
      content: r.content,
      ruleMatched: r.ruleMatched,
      category: r.category,
      severity: r.severity,
      sender: r.sender,
      timestamp: r.timestamp,
    })),
    apiKeys: db.prepare("SELECT * FROM api_keys").all().map((r) => ({
      id: r.id,
      userId: r.userId,
      label: r.label,
      prefix: r.prefix,
      keyHash: r.keyHash,
      createdAt: r.createdAt,
      lastUsedAt: r.lastUsedAt,
    })),
    sessions: db.prepare("SELECT * FROM sessions").all().map((r) => ({
      id: r.id,
      userId: r.userId,
      device: r.device,
      ip: r.ip,
      createdAt: r.createdAt,
      lastSeenAt: r.lastSeenAt,
      revoked: Boolean(r.revoked),
    })),
  };
}

const insertUser = db.prepare(`
  INSERT INTO users (id, name, email, phone, passwordHash, role, plan, status, createdAt, tokenVersion, resetCode, twoFactorEnabled, twoFactorSecret, twoFactorPendingSecret, notificationPrefs)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertPlatformConnection = db.prepare("INSERT INTO platform_connections (id, userId, data) VALUES (?, ?, ?)");
const insertTelegramLink = db.prepare("INSERT INTO telegram_links (userId, code, verified, createdAt, chatId, telegramUsername, chatType, groupTitle) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
const insertPhoneVerification = db.prepare("INSERT INTO phone_verifications (userId, platformId, phone, code, expiresAt, attempts) VALUES (?, ?, ?, ?, ?, ?)");
const insertPendingPayment = db.prepare("INSERT INTO pending_payments (checkoutRequestId, userId, plan, status, createdAt) VALUES (?, ?, ?, ?, ?)");
const insertFilterRule = db.prepare("INSERT INTO filter_rules (id, userId, name, category, severity, enabled, keywords, description, matchCount, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
const insertActivityEvent = db.prepare("INSERT INTO activity_events (id, userId, platformId, platformName, status, content, ruleMatched, category, severity, sender, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
const insertApiKey = db.prepare("INSERT INTO api_keys (id, userId, label, prefix, keyHash, createdAt, lastUsedAt) VALUES (?, ?, ?, ?, ?, ?, ?)");
const insertSession = db.prepare("INSERT INTO sessions (id, userId, device, ip, createdAt, lastSeenAt, revoked) VALUES (?, ?, ?, ?, ?, ?, ?)");

/**
 * Replaces every table's contents with the given in-memory snapshot, all
 * inside one transaction — genuinely atomic across all nine collections
 * (the temp-file-rename trick this replaced only ever made a single JSON
 * blob atomic, not safe for more than one writer process at a time).
 *
 * node:sqlite's DatabaseSync does not expose a .transaction() helper (that
 * is a better-sqlite3 API). We use explicit BEGIN / COMMIT / ROLLBACK via
 * db.exec() wrapped in try/finally so any throw always rolls back rather
 * than leaving a half-written database.
 */
function save(data) {
  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM users");
    for (const u of data.users) {
      insertUser.run(
        u.id, u.name, u.email, u.phone || "", u.passwordHash, u.role, u.plan, u.status, u.createdAt,
        u.tokenVersion || 0,
        u.resetCode ? JSON.stringify(u.resetCode) : null,
        u.twoFactorEnabled ? 1 : 0,
        u.twoFactorSecret || null,
        u.twoFactorPendingSecret || null,
        u.notificationPrefs ? JSON.stringify(u.notificationPrefs) : null
      );
    }

    db.exec("DELETE FROM platform_connections");
    for (const c of data.platformConnections) {
      insertPlatformConnection.run(c.id, c.userId, JSON.stringify(c));
    }

    db.exec("DELETE FROM telegram_links");
    for (const l of data.telegramLinks) {
      insertTelegramLink.run(l.userId, l.code, l.verified ? 1 : 0, l.createdAt, l.chatId != null ? String(l.chatId) : null, l.telegramUsername || null, l.chatType || null, l.groupTitle || null);
    }

    db.exec("DELETE FROM phone_verifications");
    for (const v of data.phoneVerifications) {
      insertPhoneVerification.run(v.userId, v.platformId, v.phone, v.code, v.expiresAt, v.attempts || 0);
    }

    db.exec("DELETE FROM pending_payments");
    for (const p of data.pendingPayments) {
      insertPendingPayment.run(p.checkoutRequestId, p.userId, p.plan, p.status, p.createdAt);
    }

    db.exec("DELETE FROM filter_rules");
    for (const r of data.filterRules) {
      insertFilterRule.run(r.id, r.userId, r.name, r.category, r.severity, r.enabled ? 1 : 0, JSON.stringify(r.keywords), r.description || "", r.matchCount || 0, r.createdAt);
    }

    db.exec("DELETE FROM activity_events");
    for (const e of data.activityEvents) {
      insertActivityEvent.run(e.id, e.userId, e.platformId, e.platformName, e.status, e.content, e.ruleMatched, e.category, e.severity, e.sender, e.timestamp);
    }

    db.exec("DELETE FROM api_keys");
    for (const k of data.apiKeys) {
      insertApiKey.run(k.id, k.userId, k.label, k.prefix, k.keyHash, k.createdAt, k.lastUsedAt || null);
    }

    db.exec("DELETE FROM sessions");
    for (const s of data.sessions) {
      insertSession.run(s.id, s.userId, s.device, s.ip, s.createdAt, s.lastSeenAt, s.revoked ? 1 : 0);
    }

    db.exec("COMMIT");
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch { /* ignore rollback errors */ }
    throw err;
  }
}

// One-time import of the old flat-file store, if this is a fresh SQLite
// database but a db.json from before the migration still exists — otherwise
// every account, rule, and activity event built up under the old storage
// would silently disappear the moment this shipped. Runs down here, after
// save()'s prepared statements exist, since it calls save() directly.
if (isNewDb && fs.existsSync(LEGACY_JSON_PATH)) {
  try {
    const legacy = JSON.parse(fs.readFileSync(LEGACY_JSON_PATH, "utf-8").replace(/^﻿/, ""));
    save({ ...defaultData(), ...legacy });
    console.log(`[db] Migrated ${legacy.users?.length ?? 0} users from db.json into SQLite (database.db).`);
    fs.renameSync(LEGACY_JSON_PATH, `${LEGACY_JSON_PATH}.migrated`);
  } catch (err) {
    console.error("[db] Failed to migrate legacy db.json — starting from an empty database instead:", err.message);
  }
}

const getKvStmt = db.prepare("SELECT value FROM kv_store WHERE key = ?");
const setKvStmt = db.prepare("INSERT INTO kv_store (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");

/**
 * Small standalone key-value helpers, outside the load()/save() whole-
 * snapshot pattern — for state like Telegram's poll offset that's updated
 * far more often than a real business record, and would otherwise force a
 * full read-modify-write of every table just to bump one counter.
 */
function getKv(key) {
  const row = getKvStmt.get(key);
  return row ? row.value : null;
}

function setKv(key, value) {
  setKvStmt.run(key, value);
}

// SQLite hydrates synchronously at require-time (above), so there is nothing
// to await — initDb exists only so the dispatcher can treat both backends the
// same way. defaultData is exported so the dispatcher's seed logic can build
// an empty store without depending on either backend's internals.
module.exports = { load, save, getKv, setKv, initDb: async () => {}, defaultData };
