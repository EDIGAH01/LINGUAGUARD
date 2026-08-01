const { Pool } = require("pg");

/**
 * PostgreSQL backing store, used whenever DATABASE_URL is set (i.e. on Render).
 *
 * Why a single JSON blob rather than normalised tables: every route in this
 * app already reads the WHOLE store into memory with load() and filters in
 * JavaScript, then writes the WHOLE store back with save() — it never issues a
 * targeted SQL query. So relational tables and indexes would be dead weight.
 * Persisting the exact in-memory shape as one JSONB row is functionally
 * identical to how the app uses SQLite today, keeps load()/save() synchronous
 * (no 100-call-site async rewrite), and gives the one thing SQLite on Render's
 * ephemeral disk could not: data that survives deploys and restarts.
 *
 * Durability model: save() updates the in-memory cache synchronously and
 * schedules an asynchronous write-through, coalescing bursts into one write.
 * On a graceful shutdown (Render sends SIGTERM before a deploy) index.js calls
 * flush() so the final state is persisted. The only loss window is an *unclean*
 * kill in the millisecond between save() and the queued write — and the two
 * paths where that would matter most, payments and sessions, are self-healing:
 * the M-Pesa grant is idempotently re-applied by the status poll / callback,
 * and a lost session just means re-logging in.
 */

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

let pool = null;
let store = defaultData();
let kv = {};

// Write-through coalescing state.
let dirty = false;
let writing = false;

const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || "");

async function initDb() {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Managed Postgres (Render, Neon, Supabase) terminates TLS with a cert
    // chain Node won't verify by default; a local cluster has no TLS at all.
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 5,
  });

  await pool.query("CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY, data JSONB NOT NULL)");
  const res = await pool.query("SELECT data FROM app_state WHERE id = 1");

  if (res.rows.length > 0) {
    const saved = res.rows[0].data || {};
    // Merge over defaults so a store written before a new collection existed
    // still comes back with that collection present (as an empty array).
    store = { ...defaultData(), ...(saved.store || {}) };
    kv = saved.kv || {};
    console.log(`[db] Connected to Postgres — loaded ${store.users.length} users, ${store.activityEvents.length} events.`);
  } else {
    await pool.query("INSERT INTO app_state (id, data) VALUES (1, $1)", [serialize()]);
    console.log("[db] Connected to Postgres — initialised an empty store.");
  }
}

function serialize() {
  return JSON.stringify({ store, kv });
}

function scheduleWrite() {
  dirty = true;
  if (writing) return; // an in-flight writer will pick up the new dirty state
  writing = true;
  (async () => {
    while (dirty) {
      dirty = false;
      const snapshot = serialize();
      try {
        await pool.query("UPDATE app_state SET data = $1 WHERE id = 1", [snapshot]);
      } catch (err) {
        // Put the work back and back off — never drop a pending write.
        console.error("[db] Postgres write failed, will retry:", err.message);
        dirty = true;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    writing = false;
  })();
}

// Fresh copy per call, matching SQLite's load() semantics (which builds new
// objects from rows) so a handler that mutates the result can't leak into
// shared state until it explicitly save()s.
function load() {
  return structuredClone(store);
}

function save(data) {
  store = data;
  scheduleWrite();
}

function getKv(key) {
  return key in kv ? kv[key] : null;
}

function setKv(key, value) {
  kv[key] = value;
  scheduleWrite();
}

/** Waits until every queued write has been flushed. Called on graceful shutdown. */
async function flush() {
  while (dirty || writing) {
    await new Promise((r) => setTimeout(r, 25));
  }
}

module.exports = { initDb, load, save, getKv, setKv, flush, defaultData };
