#!/usr/bin/env node
/**
 * One-off migration: copy an existing SQLite database (server/database.db, the
 * storage LinguaGuard used before PostgreSQL) into the Postgres database named
 * by DATABASE_URL.
 *
 * Only needed if you have real data in server/database.db you want to keep.
 * A fresh Postgres deployment doesn't need this — it seeds its own admin.
 *
 * Usage (from the project root):
 *   DATABASE_URL=postgres://user:pass@host:5432/linguaguard \
 *     node server/scripts/sqlite-to-postgres.js
 *
 * It reads every table out of SQLite, hands the assembled snapshot to the new
 * db.js save() (so the exact same serialisation and schema are used), and
 * refuses to run if the target Postgres already has users — migrating on top of
 * live data would double or clobber it. Pass --force to override.
 */
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const SQLITE_PATH = path.join(__dirname, "..", "database.db");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Point it at the target Postgres database.");
    process.exit(1);
  }
  if (!fs.existsSync(SQLITE_PATH)) {
    console.error(`No SQLite database found at ${SQLITE_PATH} — nothing to migrate.`);
    process.exit(1);
  }

  const db = require("../db");
  await db.initDb();

  const existing = db.load();
  const force = process.argv.includes("--force");
  if (existing.users.length > 0 && !force) {
    console.error(
      `Target Postgres already has ${existing.users.length} user(s). Refusing to migrate on ` +
        "top of existing data. Re-run with --force only if you are sure."
    );
    process.exit(1);
  }

  // Read everything out of the old SQLite file using its own schema.
  const sqlite = new DatabaseSync(SQLITE_PATH, { readOnly: true });
  const all = (sql) => sqlite.prepare(sql).all();

  const snapshot = {
    users: all("SELECT * FROM users").map((r) => {
      const u = {
        id: r.id, name: r.name, email: r.email, phone: r.phone, passwordHash: r.passwordHash,
        role: r.role, plan: r.plan, status: r.status, createdAt: r.createdAt,
        tokenVersion: r.tokenVersion, twoFactorEnabled: Boolean(r.twoFactorEnabled),
      };
      if (r.resetCode) u.resetCode = JSON.parse(r.resetCode);
      if (r.twoFactorSecret) u.twoFactorSecret = r.twoFactorSecret;
      if (r.twoFactorPendingSecret) u.twoFactorPendingSecret = r.twoFactorPendingSecret;
      if (r.notificationPrefs) u.notificationPrefs = JSON.parse(r.notificationPrefs);
      return u;
    }),
    platformConnections: all("SELECT * FROM platform_connections").map((r) => JSON.parse(r.data)),
    telegramLinks: all("SELECT * FROM telegram_links ORDER BY rowid").map((r) => {
      const l = { userId: r.userId, code: r.code, verified: Boolean(r.verified), createdAt: r.createdAt };
      if (r.chatId !== null) l.chatId = Number(r.chatId);
      if (r.telegramUsername) l.telegramUsername = r.telegramUsername;
      if (r.chatType) l.chatType = r.chatType;
      if (r.groupTitle) l.groupTitle = r.groupTitle;
      return l;
    }),
    phoneVerifications: all("SELECT * FROM phone_verifications ORDER BY rowid").map((r) => ({
      userId: r.userId, platformId: r.platformId, phone: r.phone, code: r.code, expiresAt: r.expiresAt, attempts: r.attempts,
    })),
    pendingPayments: all("SELECT * FROM pending_payments").map((r) => ({
      checkoutRequestId: r.checkoutRequestId, userId: r.userId, plan: r.plan, status: r.status, createdAt: r.createdAt,
    })),
    filterRules: all("SELECT * FROM filter_rules").map((r) => ({
      id: r.id, userId: r.userId, name: r.name, category: r.category, severity: r.severity,
      enabled: Boolean(r.enabled), keywords: JSON.parse(r.keywords), description: r.description,
      matchCount: r.matchCount, createdAt: r.createdAt,
    })),
    activityEvents: all("SELECT * FROM activity_events").map((r) => ({
      id: r.id, userId: r.userId, platformId: r.platformId, platformName: r.platformName, status: r.status,
      content: r.content, ruleMatched: r.ruleMatched, category: r.category, severity: r.severity, sender: r.sender, timestamp: r.timestamp,
    })),
    apiKeys: all("SELECT * FROM api_keys").map((r) => ({
      id: r.id, userId: r.userId, label: r.label, prefix: r.prefix, keyHash: r.keyHash, createdAt: r.createdAt, lastUsedAt: r.lastUsedAt,
    })),
    sessions: all("SELECT * FROM sessions").map((r) => ({
      id: r.id, userId: r.userId, device: r.device, ip: r.ip, createdAt: r.createdAt, lastSeenAt: r.lastSeenAt, revoked: Boolean(r.revoked),
    })),
  };

  // Carry over the key-value store too (Telegram poll offset, digest clocks).
  let kv = [];
  try { kv = all("SELECT key, value FROM kv_store"); } catch { /* older DB without kv_store */ }

  sqlite.close();

  await db.save(snapshot);
  for (const { key, value } of kv) db.setKv(key, value);

  const counts = Object.fromEntries(Object.entries(snapshot).map(([k, v]) => [k, v.length]));
  console.log("Migrated into Postgres:", JSON.stringify(counts, null, 2));
  console.log(`Plus ${kv.length} key-value entries.`);
  console.log("Done. Verify the app, then you can archive server/database.db.");

  // setKv writes are fire-and-forget; give them a moment to flush.
  await new Promise((r) => setTimeout(r, 500));
  process.exit(0);
}

main().catch((err) => { console.error("Migration failed:", err.message); process.exit(1); });
