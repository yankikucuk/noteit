/**
 * @file SQLite database: connection, PRAGMA tuning, schema, indexes, migrations.
 *
 * Uses better-sqlite3 (synchronous). The database lives in the user's userData
 * directory. The baseline schema and indexes are declared idempotently with
 * `IF NOT EXISTS`; changes to *existing* tables go through the ordered
 * {@link MIGRATIONS} list, versioned via `PRAGMA user_version`, so older
 * installs upgrade cleanly. All `profile_id` columns cascade from `profiles`,
 * so deleting a profile removes its data. Full-text search (FTS5) is an
 * optional layer — when the SQLite build lacks it, search falls back to LIKE.
 */

import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, copyFileSync, renameSync } from 'fs'
import log from './logger.js'
import { t } from './i18n.js'

/** @type {import('better-sqlite3').Database|null} */
let db = null

/**
 * Opens the database, applies PRAGMAs and ensures the schema. If the file is
 * corrupt, it is set aside (renamed `.corrupt-<ts>`) and recreated so the app
 * still starts — the salvaged file is left for possible manual recovery.
 * @returns {import('better-sqlite3').Database} The open connection.
 */
export function initDatabase() {
  const userData = app.getPath('userData')
  if (!existsSync(userData)) mkdirSync(userData, { recursive: true })
  const dbPath = join(userData, 'noteit.db')

  try {
    openAndPrepare(dbPath)
  } catch (err) {
    log.error('Database appears corrupt; recreating from scratch:', err)
    setAsideCorrupt(dbPath)
    openAndPrepare(dbPath)
  }
  return db
}

/** Opens the connection, applies PRAGMAs, verifies integrity and ensures schema. */
function openAndPrepare(dbPath) {
  db = new Database(dbPath)

  // Performance / durability tuning.
  db.pragma('journal_mode = WAL') // concurrent reads + writer, fast commits
  db.pragma('synchronous = NORMAL') // safe under WAL; avoids fsync per write
  db.pragma('foreign_keys = ON') // enforce CASCADE / SET NULL relationships
  db.pragma('busy_timeout = 5000') // wait on lock contention instead of erroring
  db.pragma('cache_size = -16000') // ~16 MB page cache
  db.pragma('temp_store = MEMORY') // temp tables / sorts in RAM
  db.pragma('mmap_size = 268435456') // 256 MB memory-mapped I/O
  db.pragma('wal_autocheckpoint = 1000') // bound WAL growth

  if (db.pragma('quick_check', { simple: true }) !== 'ok') {
    throw new Error('Integrity quick_check failed')
  }

  createTables()
  createIndexes()
  seedDefaults()
  applyMigrations()
  // Full-text search is an optimisation, not a correctness requirement: if this
  // SQLite build lacks FTS5, log and continue (search falls back to LIKE).
  try {
    createFtsIndex()
  } catch (err) {
    log.warn('Full-text search index unavailable; using LIKE-based search:', err)
  }
}

/** Latest schema version this build understands. Bump when adding a migration. */
const SCHEMA_VERSION = 2

/**
 * Ordered schema migrations for changes that cannot be expressed idempotently
 * with `CREATE ... IF NOT EXISTS` — i.e. altering or backfilling *existing*
 * tables. The baseline schema is created by {@link createTables}; add an entry
 * here (and bump {@link SCHEMA_VERSION}) whenever an existing table changes, so
 * older installs upgrade cleanly. Each entry moves the database from
 * `version - 1` to `version`.
 *
 * Example:
 *   { version: 2, up: (d) => d.exec('ALTER TABLE notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0') }
 *
 * @type {Array<{version: number, up: (db: import('better-sqlite3').Database) => void}>}
 */
const MIGRATIONS = [
  // v2: notes can be archived (kept out of the main list without trashing).
  {
    version: 2,
    up: (d) => d.exec('ALTER TABLE notes ADD COLUMN archived_at INTEGER')
  }
]

/**
 * Applies any pending migrations, then records the schema version in
 * `PRAGMA user_version`. Each migration runs in its own transaction, so a
 * failure leaves the database at a consistent, known version.
 */
function applyMigrations() {
  let current = db.pragma('user_version', { simple: true })
  for (const migration of MIGRATIONS) {
    if (migration.version > current) {
      const tx = db.transaction(() => {
        migration.up(db)
        db.pragma(`user_version = ${migration.version}`)
      })
      tx()
      current = migration.version
    }
  }
  if (current < SCHEMA_VERSION) db.pragma(`user_version = ${SCHEMA_VERSION}`)
}

/** Renames a corrupt database (and its WAL/SHM sidecars) out of the way. */
function setAsideCorrupt(dbPath) {
  if (db) {
    try {
      db.close()
    } catch {
      // ignore
    }
    db = null
  }
  const stamp = Date.now()
  for (const suffix of ['', '-wal', '-shm']) {
    const f = dbPath + suffix
    if (existsSync(f)) {
      try {
        renameSync(f, `${f}.corrupt-${stamp}`)
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Returns the open database, throwing if it has not been initialised.
 * @returns {import('better-sqlite3').Database}
 */
export function getDb() {
  if (!db) throw new Error('Database has not been initialised')
  return db
}

/** @returns {string} Absolute path to the database file. */
export function getDbPath() {
  return join(app.getPath('userData'), 'noteit.db')
}

/** Creates all tables. `profile_id` columns cascade from `profiles`. */
function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      password_hash TEXT,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      created_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notebooks (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      profile_id INTEGER NOT NULL DEFAULT 1 REFERENCES profiles(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notes (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      notebook_id   INTEGER REFERENCES notebooks(id) ON DELETE SET NULL,
      profile_id    INTEGER NOT NULL DEFAULT 1 REFERENCES profiles(id) ON DELETE CASCADE,
      content       TEXT NOT NULL DEFAULT '',
      plain_text    TEXT NOT NULL DEFAULT '',
      color         TEXT NOT NULL DEFAULT 'yellow',
      opacity       REAL NOT NULL DEFAULT 1.0,
      font_size     INTEGER NOT NULL DEFAULT 14,
      always_on_top INTEGER NOT NULL DEFAULT 0,
      locked        INTEGER NOT NULL DEFAULT 0,
      starred       INTEGER NOT NULL DEFAULT 0,
      collapsed     INTEGER NOT NULL DEFAULT 0,
      hidden        INTEGER NOT NULL DEFAULT 0,
      x             INTEGER,
      y             INTEGER,
      width         INTEGER NOT NULL DEFAULT 260,
      height        INTEGER NOT NULL DEFAULT 280,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL,
      deleted_at    INTEGER
    );

    CREATE TABLE IF NOT EXISTS alarms (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id       INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      trigger_at    INTEGER NOT NULL,
      repeat_mode   TEXT NOT NULL DEFAULT 'once',
      enabled       INTEGER NOT NULL DEFAULT 1,
      last_fired_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS tags (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      color      TEXT NOT NULL DEFAULT 'slate',
      profile_id INTEGER NOT NULL DEFAULT 1 REFERENCES profiles(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      UNIQUE(profile_id, name)
    );

    CREATE TABLE IF NOT EXISTS note_tags (
      note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
      PRIMARY KEY (note_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS note_versions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id    INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      content    TEXT NOT NULL,
      plain_text TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
  `)
}

/**
 * Creates composite indexes matching the real query patterns:
 *  - notes:  WHERE profile_id=? AND deleted_at IS NULL ORDER BY updated_at DESC
 *  - count:  WHERE notebook_id=? AND deleted_at IS NULL
 *  - alarms: WHERE enabled=1 AND trigger_at<=?
 */
function createIndexes() {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_notes_active   ON notes(profile_id, deleted_at, updated_at);
    CREATE INDEX IF NOT EXISTS idx_notes_notebook ON notes(notebook_id, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_notebooks_prof ON notebooks(profile_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_tags_prof      ON tags(profile_id, name);
    CREATE INDEX IF NOT EXISTS idx_alarms_note    ON alarms(note_id);
    CREATE INDEX IF NOT EXISTS idx_alarms_due     ON alarms(enabled, trigger_at);
    CREATE INDEX IF NOT EXISTS idx_note_tags_tag  ON note_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_note_versions  ON note_versions(note_id, id);
  `)
}

/**
 * Creates the FTS5 full-text index over `notes.plain_text` and the triggers
 * that keep it in sync. Uses an external-content table (the index stores only
 * tokens; the text stays in `notes`). The content trigger fires only when
 * `plain_text` changes, so frequent position/size updates cost nothing.
 *
 * The expensive full `rebuild` (re-tokenising every note) runs only when the
 * index is first created — once the triggers exist they keep it in sync, so
 * rebuilding on every launch would just re-do the same work at startup.
 */
function createFtsIndex() {
  const existed = !!db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'notes_fts'")
    .get()

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      plain_text,
      content = 'notes',
      content_rowid = 'id',
      tokenize = "unicode61 remove_diacritics 2"
    );

    CREATE TRIGGER IF NOT EXISTS notes_fts_ai AFTER INSERT ON notes BEGIN
      INSERT INTO notes_fts(rowid, plain_text) VALUES (new.id, new.plain_text);
    END;

    CREATE TRIGGER IF NOT EXISTS notes_fts_ad AFTER DELETE ON notes BEGIN
      INSERT INTO notes_fts(notes_fts, rowid, plain_text) VALUES ('delete', old.id, old.plain_text);
    END;

    CREATE TRIGGER IF NOT EXISTS notes_fts_au AFTER UPDATE OF plain_text ON notes BEGIN
      INSERT INTO notes_fts(notes_fts, rowid, plain_text) VALUES ('delete', old.id, old.plain_text);
      INSERT INTO notes_fts(rowid, plain_text) VALUES (new.id, new.plain_text);
    END;
  `)

  // Index rows that predate the freshly created table (first run / upgrades).
  if (!existed) db.exec("INSERT INTO notes_fts(notes_fts) VALUES ('rebuild')")
}

/** Seeds the default (localized) profile and its first category on a fresh database. */
function seedDefaults() {
  const pcount = db.prepare('SELECT COUNT(*) AS c FROM profiles').get().c
  if (pcount === 0) {
    db.prepare('INSERT INTO profiles (name, sort_order, created_at) VALUES (?, 0, ?)').run(
      t('profile.default'),
      Date.now()
    )
  }
  const pid = db.prepare('SELECT id FROM profiles ORDER BY sort_order, id LIMIT 1').get().id
  const nbCount = db.prepare('SELECT COUNT(*) AS c FROM notebooks WHERE profile_id = ?').get(pid).c
  if (nbCount === 0) {
    db.prepare(
      'INSERT INTO notebooks (name, sort_order, profile_id, created_at) VALUES (?, 0, ?, ?)'
    ).run(t('category.default'), pid, Date.now())
  }
}

/**
 * Validates that a file is a usable NoteIt database before it is allowed to
 * replace the live one. Opens it read-only, runs an integrity check and
 * confirms the expected core tables exist.
 * @param {string} filePath - Candidate database file.
 * @returns {boolean} True if the file is a valid, non-corrupt NoteIt database.
 */
export function isValidDatabaseFile(filePath) {
  let probe = null
  try {
    probe = new Database(filePath, { readonly: true, fileMustExist: true })
    if (probe.pragma('quick_check', { simple: true }) !== 'ok') return false
    const tables = probe
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((r) => r.name)
    return ['profiles', 'notes', 'notebooks'].every((name) => tables.includes(name))
  } catch (err) {
    log.warn('Backup validation failed:', err)
    return false
  } finally {
    if (probe) {
      try {
        probe.close()
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Copies the database to a user-chosen path (backup). Checkpoints the WAL first
 * so the copy is complete.
 * @param {string} destPath - Destination file path.
 * @returns {string} The destination path.
 */
export function backupTo(destPath) {
  db.pragma('wal_checkpoint(TRUNCATE)')
  copyFileSync(getDbPath(), destPath)
  return destPath
}

/** Runs `PRAGMA optimize` and closes the connection. */
export function closeDatabase() {
  if (db) {
    try {
      db.pragma('optimize') // refresh query-planner statistics
    } catch {
      // ignore
    }
    db.close()
    db = null
  }
}
