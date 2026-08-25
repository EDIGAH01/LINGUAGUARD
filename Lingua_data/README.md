# Lingua_data

Local SQLite storage for LinguaGuard (development only). The path is set in
`server/sqliteStore.js` (`DATA_DIR`) and can be overridden with the
`LINGUA_DATA_DIR` environment variable.

## Files

| File | What it is |
|------|------------|
| `linguaguard.db` | **The database.** All application data — users, filter rules, activity events, sessions, API keys, platform connections, phone verifications, pending payments, and the key/value store. This is the only file that holds durable data. |
| `linguaguard.db-wal` | Write-ahead log (SQLite WAL mode). Transient — holds committed transactions not yet folded into the main file. Regenerated automatically; safe to delete when the app is stopped. |
| `linguaguard.db-shm` | Shared-memory index for the WAL. Transient — regenerated automatically. |

The `-wal` and `-shm` files only exist while the database is in use and are
managed entirely by SQLite. Only `linguaguard.db` needs to be backed up.

## Production

On Render, `DATABASE_URL` is set and the app uses **Postgres** instead
(`server/pgStore.js`) — this folder is unused there. The storage backend is
chosen at boot in `server/db.js`.

## Git

The database files are gitignored (they hold real, environment-specific data).
Only this README is tracked, so the folder and its documentation live in the
repo while the data stays local.
