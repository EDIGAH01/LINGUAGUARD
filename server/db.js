const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

/**
 * Storage dispatcher. Picks the backing store from the environment:
 *
 *   • DATABASE_URL set  → Postgres (server/pgStore.js). This is production /
 *     Render, where the filesystem is ephemeral and SQLite would lose all data
 *     on every deploy.
 *   • otherwise         → SQLite (server/sqliteStore.js). Zero-config local
 *     development, and where any existing local database.db already lives.
 *
 * Crucially, sqliteStore is required ONLY on the SQLite path. It does
 * `require("node:sqlite")` at load time, which is experimental on the Node 22
 * that Render pins — requiring it there would crash the process on boot even
 * though Postgres is what's actually in use. Gating the require behind the
 * DATABASE_URL check keeps node:sqlite off the production path entirely.
 *
 * Both backends expose the same synchronous load()/save()/getKv()/setKv()
 * surface, so none of the ~100 call sites across the server change.
 */
const USE_PG = Boolean(process.env.DATABASE_URL);
const backend = USE_PG ? require("./pgStore") : require("./sqliteStore");

const SEED_CREDENTIALS_PATH = path.join(__dirname, ".seed-admin-credentials.txt");

/**
 * Hydrates the store before anything reads it. No-op for SQLite (which loads
 * synchronously at require-time); for Postgres this connects and pulls the
 * saved snapshot into memory. index.js awaits this before serving traffic.
 */
async function initDb() {
  await backend.initDb();
}

/**
 * Seeds a default admin on first run so there's always a way in. Lives here,
 * not in either backend, because it's pure business logic over load()/save()
 * — identical for SQLite and Postgres.
 */
function ensureSeedAdmin() {
  const data = backend.load();
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
  backend.save(data);

  console.log("─".repeat(60));
  console.log("No users existed yet — seeded a default admin account:");
  console.log(`  email: ${email}`);

  if (!process.env.SEED_ADMIN_PASSWORD) {
    // Never print the secret to stdout — process logs get copied to more
    // places than expected (a hosting platform's log viewer, a screen-share).
    // On an ephemeral host (Render) this file won't survive, which is exactly
    // why you should set SEED_ADMIN_PASSWORD there rather than rely on it.
    try {
      fs.writeFileSync(SEED_CREDENTIALS_PATH, `${email}\n${password}\n`, { mode: 0o600 });
      console.log(`  password: written to ${SEED_CREDENTIALS_PATH}`);
      console.log("  Read it, log in, then delete that file — it won't be regenerated.");
    } catch (err) {
      // A read-only or ephemeral filesystem shouldn't crash startup; fall back
      // to a one-time stdout print so the operator isn't locked out.
      console.log(`  password: ${password}`);
      console.log(`  (couldn't write ${SEED_CREDENTIALS_PATH}: ${err.message})`);
    }
  } else {
    console.log("  password: (from SEED_ADMIN_PASSWORD env var)");
  }
  console.log("─".repeat(60));
}

/** Flushes any pending Postgres write on graceful shutdown; no-op for SQLite. */
async function flush() {
  if (backend.flush) await backend.flush();
}

module.exports = {
  initDb,
  ensureSeedAdmin,
  flush,
  load: backend.load,
  save: backend.save,
  getKv: backend.getKv,
  setKv: backend.setKv,
};
