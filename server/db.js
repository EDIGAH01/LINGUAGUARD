const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { Pool, types } = require("pg");

const LEGACY_JSON_PATH = path.join(__dirname, "db.json");
const SEED_CREDENTIALS_PATH = path.join(__dirname, ".seed-admin-credentials.txt");

// node-postgres returns BIGINT (int8) as a STRING by default to avoid silent
// precision loss. Every int8 in this schema is an epoch-millisecond timestamp,
// comfortably under 2^53, so the app expects real numbers (it does arithmetic
// and comparisons on them). Parse them back to Number.
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. LinguaGuard now uses PostgreSQL — set DATABASE_URL " +
      "(e.g. postgresql://user:pass@host:5432/linguaguard). On Render this is " +
      "wired automatically from the database defined in render.yaml."
  );
}

// A managed provider (Render, Neon, Supabase, …) terminates TLS and requires
// SSL, but a local dev cluster on localhost usually doesn't. Enable SSL for
// anything that isn't a loopback host, and don't fail on the provider's own
// cert chain (which node doesn't have a root for by default).
const isLocal = /@(localhost|127\.0\.0\.1)\b/.test(connectionString);
const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 10,
});

// ─── Schema ──────────────────────────────────────────────────────────────────
// Identifiers are quoted so Postgres preserves the camelCase column names the
// row-mapping code already expects (unquoted, Postgres folds them to
// lowercase). Types mirror the previous SQLite schema exactly: booleans and
// small counters as INTEGER 0/1, epoch-ms timestamps as BIGINT, ISO strings and
// everything else as TEXT — so the JS objects passed around are byte-identical
// to before.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL UNIQUE,
    "phone" TEXT NOT NULL DEFAULT '',
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "resetCode" TEXT,
    "twoFactorEnabled" INTEGER NOT NULL DEFAULT 0,
    "twoFactorSecret" TEXT,
    "twoFactorPendingSecret" TEXT,
    "notificationPrefs" TEXT
  );

  CREATE TABLE IF NOT EXISTS platform_connections (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "data" TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_platform_connections_user ON platform_connections("userId");

  CREATE TABLE IF NOT EXISTS telegram_links (
    "rowid" BIGSERIAL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "verified" INTEGER NOT NULL DEFAULT 0,
    "createdAt" BIGINT NOT NULL,
    "chatId" TEXT,
    "telegramUsername" TEXT,
    "chatType" TEXT,
    "groupTitle" TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_telegram_links_user ON telegram_links("userId");

  CREATE TABLE IF NOT EXISTS phone_verifications (
    "rowid" BIGSERIAL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" BIGINT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_phone_verifications_user ON phone_verifications("userId");

  CREATE TABLE IF NOT EXISTS pending_payments (
    "checkoutRequestId" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pending_payments_user ON pending_payments("userId");

  CREATE TABLE IF NOT EXISTS filter_rules (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "enabled" INTEGER NOT NULL DEFAULT 1,
    "keywords" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "matchCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_filter_rules_user ON filter_rules("userId");

  CREATE TABLE IF NOT EXISTS activity_events (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "platformName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "ruleMatched" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "timestamp" TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_activity_events_user ON activity_events("userId");
  CREATE INDEX IF NOT EXISTS idx_activity_events_timestamp ON activity_events("timestamp");

  CREATE TABLE IF NOT EXISTS api_keys (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,
    "lastUsedAt" TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys("userId");

  CREATE TABLE IF NOT EXISTS sessions (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,
    "lastSeenAt" TEXT NOT NULL,
    "revoked" INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions("userId");

  CREATE TABLE IF NOT EXISTS kv_store (
    "key" TEXT PRIMARY KEY,
    "value" TEXT NOT NULL
  );
`;

// ─── Table registry ───────────────────────────────────────────────────────────
// One spec per collection drives both loading and diff-based persistence, so
// the read/write logic is written once (below) rather than copied nine times.
//
//   key       property name on the in-memory data object
//   table     Postgres table
//   pk        primary-key column, or null for tables with no stable app-level
//             identity (telegram_links / phone_verifications keyed by an
//             autoincrement rowid the JS objects never carried) — those are
//             cheap and tiny, so they're fully replaced on each save
//   columns   ordered column list used for INSERT/UPDATE
//   toRow     app object  -> row values (JSON.stringify, boolean->0/1, …)
//   fromRow   row         -> app object
const B = (v) => (v ? 1 : 0);

const REGISTRY = [
  {
    key: "users",
    table: "users",
    pk: "id",
    columns: ["id","name","email","phone","passwordHash","role","plan","status","createdAt","tokenVersion","resetCode","twoFactorEnabled","twoFactorSecret","twoFactorPendingSecret","notificationPrefs"],
    toRow: (u) => ({
      id: u.id, name: u.name, email: u.email, phone: u.phone || "",
      passwordHash: u.passwordHash, role: u.role, plan: u.plan, status: u.status,
      createdAt: u.createdAt, tokenVersion: u.tokenVersion || 0,
      resetCode: u.resetCode ? JSON.stringify(u.resetCode) : null,
      twoFactorEnabled: B(u.twoFactorEnabled),
      twoFactorSecret: u.twoFactorSecret || null,
      twoFactorPendingSecret: u.twoFactorPendingSecret || null,
      notificationPrefs: u.notificationPrefs ? JSON.stringify(u.notificationPrefs) : null,
    }),
    fromRow: (row) => {
      const user = {
        id: row.id, name: row.name, email: row.email, phone: row.phone,
        passwordHash: row.passwordHash, role: row.role, plan: row.plan, status: row.status,
        createdAt: row.createdAt, tokenVersion: row.tokenVersion,
        twoFactorEnabled: Boolean(row.twoFactorEnabled),
      };
      if (row.resetCode) user.resetCode = JSON.parse(row.resetCode);
      if (row.twoFactorSecret) user.twoFactorSecret = row.twoFactorSecret;
      if (row.twoFactorPendingSecret) user.twoFactorPendingSecret = row.twoFactorPendingSecret;
      if (row.notificationPrefs) user.notificationPrefs = JSON.parse(row.notificationPrefs);
      return user;
    },
  },
  {
    key: "platformConnections",
    table: "platform_connections",
    pk: "id",
    columns: ["id","userId","data"],
    toRow: (c) => ({ id: c.id, userId: c.userId, data: JSON.stringify(c) }),
    fromRow: (row) => JSON.parse(row.data),
  },
  {
    key: "telegramLinks",
    table: "telegram_links",
    pk: null, // no stable app-level id — full replace (tiny table)
    columns: ["userId","code","verified","createdAt","chatId","telegramUsername","chatType","groupTitle"],
    toRow: (l) => ({
      userId: l.userId, code: l.code, verified: B(l.verified), createdAt: l.createdAt,
      chatId: l.chatId != null ? String(l.chatId) : null,
      telegramUsername: l.telegramUsername || null,
      chatType: l.chatType || null, groupTitle: l.groupTitle || null,
    }),
    fromRow: (r) => {
      const link = { userId: r.userId, code: r.code, verified: Boolean(r.verified), createdAt: r.createdAt };
      if (r.chatId !== null) link.chatId = Number(r.chatId);
      if (r.telegramUsername) link.telegramUsername = r.telegramUsername;
      if (r.chatType) link.chatType = r.chatType;
      if (r.groupTitle) link.groupTitle = r.groupTitle;
      return link;
    },
  },
  {
    key: "phoneVerifications",
    table: "phone_verifications",
    pk: null, // full replace (tiny table)
    columns: ["userId","platformId","phone","code","expiresAt","attempts"],
    toRow: (v) => ({ userId: v.userId, platformId: v.platformId, phone: v.phone, code: v.code, expiresAt: v.expiresAt, attempts: v.attempts || 0 }),
    fromRow: (r) => ({ userId: r.userId, platformId: r.platformId, phone: r.phone, code: r.code, expiresAt: r.expiresAt, attempts: r.attempts }),
  },
  {
    key: "pendingPayments",
    table: "pending_payments",
    pk: "checkoutRequestId",
    columns: ["checkoutRequestId","userId","plan","status","createdAt"],
    toRow: (p) => ({ checkoutRequestId: p.checkoutRequestId, userId: p.userId, plan: p.plan, status: p.status, createdAt: p.createdAt }),
    fromRow: (r) => ({ checkoutRequestId: r.checkoutRequestId, userId: r.userId, plan: r.plan, status: r.status, createdAt: r.createdAt }),
  },
  {
    key: "filterRules",
    table: "filter_rules",
    pk: "id",
    columns: ["id","userId","name","category","severity","enabled","keywords","description","matchCount","createdAt"],
    toRow: (r) => ({
      id: r.id, userId: r.userId, name: r.name, category: r.category, severity: r.severity,
      enabled: B(r.enabled), keywords: JSON.stringify(r.keywords), description: r.description || "",
      matchCount: r.matchCount || 0, createdAt: r.createdAt,
    }),
    fromRow: (r) => ({
      id: r.id, userId: r.userId, name: r.name, category: r.category, severity: r.severity,
      enabled: Boolean(r.enabled), keywords: JSON.parse(r.keywords), description: r.description,
      matchCount: r.matchCount, createdAt: r.createdAt,
    }),
  },
  {
    key: "activityEvents",
    table: "activity_events",
    pk: "id",
    columns: ["id","userId","platformId","platformName","status","content","ruleMatched","category","severity","sender","timestamp"],
    toRow: (e) => ({ id: e.id, userId: e.userId, platformId: e.platformId, platformName: e.platformName, status: e.status, content: e.content, ruleMatched: e.ruleMatched, category: e.category, severity: e.severity, sender: e.sender, timestamp: e.timestamp }),
    fromRow: (r) => ({ id: r.id, userId: r.userId, platformId: r.platformId, platformName: r.platformName, status: r.status, content: r.content, ruleMatched: r.ruleMatched, category: r.category, severity: r.severity, sender: r.sender, timestamp: r.timestamp }),
  },
  {
    key: "apiKeys",
    table: "api_keys",
    pk: "id",
    columns: ["id","userId","label","prefix","keyHash","createdAt","lastUsedAt"],
    toRow: (k) => ({ id: k.id, userId: k.userId, label: k.label, prefix: k.prefix, keyHash: k.keyHash, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt || null }),
    fromRow: (r) => ({ id: r.id, userId: r.userId, label: r.label, prefix: r.prefix, keyHash: r.keyHash, createdAt: r.createdAt, lastUsedAt: r.lastUsedAt }),
  },
  {
    key: "sessions",
    table: "sessions",
    pk: "id",
    columns: ["id","userId","device","ip","createdAt","lastSeenAt","revoked"],
    toRow: (s) => ({ id: s.id, userId: s.userId, device: s.device, ip: s.ip, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, revoked: B(s.revoked) }),
    fromRow: (r) => ({ id: r.id, userId: r.userId, device: r.device, ip: r.ip, createdAt: r.createdAt, lastSeenAt: r.lastSeenAt, revoked: Boolean(r.revoked) }),
  },
];

function defaultData() {
  const d = {};
  for (const spec of REGISTRY) d[spec.key] = [];
  return d;
}

// ─── In-memory cache ──────────────────────────────────────────────────────────
// The cache is the source of truth at runtime, so load() can stay synchronous
// (returning a structural clone) and none of the ~40 read call sites across the
// route files have to become async. Postgres is the durable backing store:
// filled into the cache once at boot, and written through on every save().
let cache = defaultData();
const kvCache = new Map();
let initialized = false;

async function initDb() {
  await pool.query(SCHEMA);

  const next = defaultData();
  for (const spec of REGISTRY) {
    const order = spec.pk ? "" : ` ORDER BY "rowid"`;
    const { rows } = await pool.query(`SELECT * FROM ${spec.table}${order}`);
    next[spec.key] = rows.map(spec.fromRow);
  }
  cache = next;

  const kv = await pool.query(`SELECT "key", "value" FROM kv_store`);
  for (const row of kv.rows) kvCache.set(row.key, row.value);

  initialized = true;

  await migrateLegacyJsonIfPresent();
  await ensureSeedAdmin();
}

function load() {
  // Structural clone so callers mutate their own copy; the cache only changes
  // when they hand it back to save().
  return structuredClone(cache);
}

// ─── Diff-based, serialized write-through ─────────────────────────────────────
// Saves are serialized through a promise chain so each diff is computed against
// the latest persisted state, never a racing one. Only changed rows are written
// (the whole point of the diff): a scan that appends one activity event and
// bumps one rule's matchCount writes two rows, not the entire database as the
// old full-rewrite save() did over what is now a network hop.
let writeChain = Promise.resolve();

function save(data) {
  if (!initialized) return Promise.reject(new Error("Database not initialized — call initDb() first."));
  const snapshot = structuredClone(data);
  const result = writeChain.then(() => persist(snapshot)).then(() => { cache = snapshot; });
  // The chain must keep flowing even if this write failed, but the next writer
  // shouldn't inherit this one's rejection — the caller who awaited `result`
  // sees the real error.
  writeChain = result.catch(() => {});
  return result;
}

async function persist(snapshot) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const spec of REGISTRY) {
      if (spec.pk) await diffTable(client, spec, cache[spec.key], snapshot[spec.key]);
      else await replaceTable(client, spec, snapshot[spec.key]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Full delete + re-insert. Only used for the two tiny keyless tables. */
async function replaceTable(client, spec, rows) {
  await client.query(`DELETE FROM ${spec.table}`);
  for (const item of rows) await insertRow(client, spec, spec.toRow(item));
}

/** Writes only inserts / updates / deletes between the old and new row sets. */
async function diffTable(client, spec, oldItems, newItems) {
  const oldByPk = new Map(oldItems.map((it) => [spec.toRow(it)[spec.pk], spec.toRow(it)]));
  const newByPk = new Map(newItems.map((it) => [spec.toRow(it)[spec.pk], spec.toRow(it)]));

  for (const [pk, row] of newByPk) {
    const prev = oldByPk.get(pk);
    if (!prev) await insertRow(client, spec, row);
    else if (!rowsEqual(spec, prev, row)) await updateRow(client, spec, row);
  }
  for (const pk of oldByPk.keys()) {
    if (!newByPk.has(pk)) {
      await client.query(`DELETE FROM ${spec.table} WHERE "${spec.pk}" = $1`, [pk]);
    }
  }
}

function rowsEqual(spec, a, b) {
  for (const col of spec.columns) if (a[col] !== b[col]) return false;
  return true;
}

async function insertRow(client, spec, row) {
  const cols = spec.columns.map((c) => `"${c}"`).join(", ");
  const params = spec.columns.map((_, i) => `$${i + 1}`).join(", ");
  const values = spec.columns.map((c) => row[c]);
  await client.query(`INSERT INTO ${spec.table} (${cols}) VALUES (${params})`, values);
}

async function updateRow(client, spec, row) {
  const setCols = spec.columns.filter((c) => c !== spec.pk);
  const set = setCols.map((c, i) => `"${c}" = $${i + 1}`).join(", ");
  const values = setCols.map((c) => row[c]);
  values.push(row[spec.pk]);
  await client.query(`UPDATE ${spec.table} SET ${set} WHERE "${spec.pk}" = $${values.length}`, values);
}

// ─── Key-value store ──────────────────────────────────────────────────────────
// Small, high-frequency state (Telegram poll offset, per-user digest clocks)
// that would otherwise force a whole-snapshot save just to bump one value.
// getKv is synchronous from the cache; setKv writes through fire-and-forget —
// losing the very latest poll-offset/digest-clock bump across a crash is
// harmless (at worst a few messages re-scanned, or one duplicate digest), and
// keeping the signature sync avoids touching its call sites.
function getKv(key) {
  return kvCache.has(key) ? kvCache.get(key) : null;
}

function setKv(key, value) {
  kvCache.set(key, value);
  pool
    .query(
      `INSERT INTO kv_store ("key", "value") VALUES ($1, $2)
       ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value"`,
      [key, value]
    )
    .catch((err) => console.error(`[db] kv write failed for "${key}":`, err.message));
}

// ─── One-time legacy import ───────────────────────────────────────────────────
// If a db.json from the original flat-file store is still present and the
// Postgres database is empty, import it once so nothing built up under the old
// storage disappears. (The intermediate SQLite database.db is not imported —
// that migration already happened before this one; if you still have data only
// in database.db, run scripts/sqlite-to-postgres.js.)
async function migrateLegacyJsonIfPresent() {
  if (cache.users.length > 0) return;
  if (!fs.existsSync(LEGACY_JSON_PATH)) return;
  try {
    const legacy = JSON.parse(fs.readFileSync(LEGACY_JSON_PATH, "utf-8").replace(/^﻿/, ""));
    await save({ ...defaultData(), ...legacy });
    console.log(`[db] Migrated ${legacy.users?.length ?? 0} users from db.json into PostgreSQL.`);
    fs.renameSync(LEGACY_JSON_PATH, `${LEGACY_JSON_PATH}.migrated`);
  } catch (err) {
    console.error("[db] Failed to migrate legacy db.json — starting empty instead:", err.message);
  }
}

// ─── Seed admin ───────────────────────────────────────────────────────────────
async function ensureSeedAdmin() {
  const data = load();
  if (data.users.length > 0) return;

  const email = process.env.SEED_ADMIN_EMAIL || "admin@linguaguard.local";
  const password = process.env.SEED_ADMIN_PASSWORD || crypto.randomBytes(9).toString("base64url");

  data.users.push({
    id: crypto.randomUUID(),
    name: "Admin",
    email,
    phone: "",
    passwordHash: bcrypt.hashSync(password, 10),
    role: "admin",
    plan: "enterprise",
    status: "active",
    createdAt: new Date().toISOString(),
    tokenVersion: 0,
    twoFactorEnabled: false,
  });
  await save(data);

  console.log("─".repeat(60));
  console.log("No users existed yet — seeded a default admin account:");
  console.log(`  email: ${email}`);
  if (!process.env.SEED_ADMIN_PASSWORD) {
    // Keep the secret out of stdout, which routinely lands somewhere with a
    // wider audience than intended (platform log viewers, journals, a shared
    // screen). A local owner-only file is no more exposed than .env already is.
    try {
      fs.writeFileSync(SEED_CREDENTIALS_PATH, `${email}\n${password}\n`, { mode: 0o600 });
      console.log(`  password: written to ${SEED_CREDENTIALS_PATH}`);
      console.log("  Read it, log in, then delete that file — it won't be regenerated.");
    } catch {
      // Read-only filesystem (e.g. a container) — fall back to stdout so there
      // is still a way in on a first-ever boot with no SEED_ADMIN_PASSWORD set.
      console.log(`  password: ${password}`);
      console.log("  (printed because the credentials file could not be written — set SEED_ADMIN_PASSWORD to avoid this)");
    }
  } else {
    console.log("  password: (from SEED_ADMIN_PASSWORD env var)");
  }
  console.log("─".repeat(60));
}

module.exports = { initDb, load, save, ensureSeedAdmin, getKv, setKv };
