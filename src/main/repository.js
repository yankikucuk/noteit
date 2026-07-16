/**
 * @file Data-access layer (repository) over the SQLite database.
 *
 * All note/notebook/tag queries are scoped to the *active profile* held in
 * {@link currentProfileId}, giving each profile an isolated workspace. Every
 * statement is parameterised (no string interpolation of user input), and reads
 * that return notes attach their tags via {@link attachTags}.
 */

import { getDb } from './database.js'
import { t } from './i18n.js'
import { toFtsQuery } from '../shared/search.js'
import { sanitizeHtml } from '../shared/sanitizeHtml.js'

/** Active profile id; all scoped queries filter by this. */
let currentProfileId = 1

/**
 * Sets the active profile used by all subsequent scoped queries.
 * @param {number} id - Profile id.
 */
export function setCurrentProfile(id) {
  currentProfileId = id
}

/** @returns {number} The active profile id. */
export function getCurrentProfileId() {
  return currentProfileId
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

/**
 * Lists profiles with a `has_password` flag and active-note count.
 * @returns {object[]} Profile rows.
 */
export function listProfiles() {
  return getDb()
    .prepare(
      `SELECT p.id, p.name, p.sort_order, p.created_at,
              (p.password_hash IS NOT NULL) AS has_password,
              (SELECT COUNT(*) FROM notes n WHERE n.profile_id = p.id AND n.deleted_at IS NULL) AS note_count
         FROM profiles p ORDER BY p.sort_order, p.id`
    )
    .all()
}

/** @param {number} id @returns {object|undefined} Full profile row (incl. password_hash). */
export function getProfile(id) {
  return getDb().prepare('SELECT * FROM profiles WHERE id = ?').get(id)
}

/** @returns {number} Total profile count. */
export function countProfiles() {
  return getDb().prepare('SELECT COUNT(*) AS c FROM profiles').get().c
}

/**
 * Creates a profile and seeds it with a default (localized) category.
 * @param {string} name - Display name.
 * @param {string|null} [passwordHash] - Pre-hashed password, or null for none.
 * @returns {object|null} The created profile, or null for an empty name.
 */
export function createProfile(name, passwordHash = null) {
  const db = getDb()
  const trimmed = (name || '').trim()
  if (!trimmed) return null
  const max = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM profiles').get().m
  const info = db
    .prepare(
      'INSERT INTO profiles (name, password_hash, sort_order, created_at) VALUES (?, ?, ?, ?)'
    )
    .run(trimmed, passwordHash, max + 1, Date.now())
  const pid = info.lastInsertRowid
  db.prepare(
    'INSERT INTO notebooks (name, sort_order, profile_id, created_at) VALUES (?, 0, ?, ?)'
  ).run(t('category.default'), pid, Date.now())
  return db.prepare('SELECT * FROM profiles WHERE id = ?').get(pid)
}

/** @param {number} id @param {string} name */
export function renameProfile(id, name) {
  const trimmed = (name || '').trim()
  if (!trimmed) return
  getDb().prepare('UPDATE profiles SET name = ? WHERE id = ?').run(trimmed, id)
}

/**
 * Sets (or clears, when `hash` is null) a profile's password hash.
 * @param {number} id @param {string|null} hash
 */
export function setProfilePasswordHash(id, hash) {
  getDb().prepare('UPDATE profiles SET password_hash = ? WHERE id = ?').run(hash, id)
}

/**
 * Deletes a profile and all of its data. Foreign-key CASCADE would suffice, but
 * we delete explicitly within a transaction for clarity and portability.
 * @param {number} id - Profile id.
 */
export function deleteProfile(id) {
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM notes WHERE profile_id = ?').run(id) // cascades to note_tags & alarms
    db.prepare('DELETE FROM notebooks WHERE profile_id = ?').run(id)
    db.prepare('DELETE FROM tags WHERE profile_id = ?').run(id)
    db.prepare('DELETE FROM profiles WHERE id = ?').run(id)
  })
  tx()
}

// ---------------------------------------------------------------------------
// Tag attachment
// ---------------------------------------------------------------------------

/**
 * Attaches a `tags` array to a note (or array of notes) with a single batched
 * query. Mutates and returns the input for convenience.
 *
 * @param {object|object[]|undefined} notes - Note row(s).
 * @returns {object|object[]|undefined} The same value with `tags` populated.
 */
function attachTags(notes) {
  if (!notes) return notes
  const single = !Array.isArray(notes)
  const arr = single ? [notes] : notes
  if (arr.length) {
    const ids = arr.map((n) => n.id)
    const placeholders = ids.map(() => '?').join(',')
    const rows = getDb()
      .prepare(
        `SELECT nt.note_id AS noteId, t.id, t.name, t.color
           FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
          WHERE nt.note_id IN (${placeholders})
          ORDER BY t.name COLLATE NOCASE`
      )
      .all(...ids)
    const byNote = new Map()
    for (const r of rows) {
      if (!byNote.has(r.noteId)) byNote.set(r.noteId, [])
      byNote.get(r.noteId).push({ id: r.id, name: r.name, color: r.color })
    }
    for (const n of arr) n.tags = byNote.get(n.id) || []
  }
  return single ? arr[0] : arr
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

/**
 * Creates a note in the active profile, merging `overrides` over sensible
 * defaults.
 * @param {object} [overrides] - Fields to override.
 * @returns {object} The created note (with tags).
 */
export function createNote(overrides = {}) {
  const db = getDb()
  const now = Date.now()
  const defaults = {
    notebook_id: getDefaultNotebookId(),
    content: '',
    plain_text: '',
    color: getSetting('default_note_color', 'yellow'),
    opacity: 1.0,
    font_size: 14,
    always_on_top: 0,
    locked: 0,
    starred: 0,
    collapsed: 0,
    hidden: 0,
    x: null,
    y: null,
    width: 260,
    height: 280
  }
  const n = { ...defaults, ...overrides, profile_id: currentProfileId }
  const info = db
    .prepare(
      `INSERT INTO notes
        (notebook_id, profile_id, content, plain_text, color, opacity, font_size,
         always_on_top, locked, starred, collapsed, hidden, x, y, width, height,
         created_at, updated_at)
       VALUES
        (@notebook_id, @profile_id, @content, @plain_text, @color, @opacity, @font_size,
         @always_on_top, @locked, @starred, @collapsed, @hidden, @x, @y, @width, @height,
         @created_at, @updated_at)`
    )
    .run({ ...n, created_at: now, updated_at: now })
  return getNote(info.lastInsertRowid)
}

/** @param {number} id @returns {object|undefined} Note with tags. */
export function getNote(id) {
  return attachTags(getDb().prepare('SELECT * FROM notes WHERE id = ?').get(id))
}

/**
 * Notes shown on the desktop: active profile, not trashed, not archived, not hidden.
 * @returns {object[]}
 */
export function getVisibleNotes() {
  return attachTags(
    getDb()
      .prepare(
        'SELECT * FROM notes WHERE profile_id = ? AND deleted_at IS NULL AND archived_at IS NULL AND hidden = 0 ORDER BY created_at ASC'
      )
      .all(currentProfileId)
  )
}

/**
 * All active notes for the Explorer (not trashed, not archived), most-recently
 * updated first.
 * @returns {object[]}
 */
export function getActiveNotes() {
  return attachTags(
    getDb()
      .prepare(
        'SELECT * FROM notes WHERE profile_id = ? AND deleted_at IS NULL AND archived_at IS NULL ORDER BY updated_at DESC'
      )
      .all(currentProfileId)
  )
}

/** Trashed notes for the active profile. @returns {object[]} */
export function getTrashedNotes() {
  return attachTags(
    getDb()
      .prepare(
        'SELECT * FROM notes WHERE profile_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC'
      )
      .all(currentProfileId)
  )
}

/** Archived notes for the active profile, most-recently archived first. @returns {object[]} */
export function getArchivedNotes() {
  return attachTags(
    getDb()
      .prepare(
        'SELECT * FROM notes WHERE profile_id = ? AND archived_at IS NOT NULL AND deleted_at IS NULL ORDER BY archived_at DESC'
      )
      .all(currentProfileId)
  )
}

/** Archives a note (removes it from the desktop and main list without trashing). @param {number} id */
export function archiveNote(id) {
  getDb().prepare('UPDATE notes SET archived_at = ?, hidden = 1 WHERE id = ?').run(Date.now(), id)
}

/** Restores an archived note to the active list. @param {number} id */
export function unarchiveNote(id) {
  getDb().prepare('UPDATE notes SET archived_at = NULL WHERE id = ?').run(id)
}

/** Whitelist of note columns that {@link updateNote} is allowed to write. */
const UPDATABLE = new Set([
  'notebook_id',
  'content',
  'plain_text',
  'color',
  'opacity',
  'font_size',
  'always_on_top',
  'locked',
  'starred',
  'collapsed',
  'hidden',
  'x',
  'y',
  'width',
  'height'
])

/**
 * Updates only the whitelisted fields of a note (unknown keys are ignored,
 * which also guards against writing arbitrary columns). When the content
 * changes, the previous content is snapshotted into the version history.
 * @param {number} id - Note id.
 * @param {object} fields - Partial fields to write.
 * @returns {object} The updated note.
 */
export function updateNote(id, fields) {
  const db = getDb()
  const keys = Object.keys(fields).filter((k) => UPDATABLE.has(k))
  if (keys.length === 0) return getNote(id)
  if (keys.includes('content')) captureNoteVersion(id)
  const setClause = keys.map((k) => `${k} = @${k}`).join(', ')
  const payload = { id, updated_at: Date.now() }
  for (const k of keys) payload[k] = fields[k]
  db.prepare(`UPDATE notes SET ${setClause}, updated_at = @updated_at WHERE id = @id`).run(payload)
  return getNote(id)
}

// ---------------------------------------------------------------------------
// Note version history
// ---------------------------------------------------------------------------

/** Minimum gap between snapshots of the same note (collapses rapid autosaves). */
const VERSION_THROTTLE_MS = 90 * 1000

/** How many versions to retain per note; older ones are pruned. */
const MAX_VERSIONS_PER_NOTE = 30

/**
 * Snapshots a note's *current* (about-to-be-replaced) content into the version
 * history, then prunes to {@link MAX_VERSIONS_PER_NOTE}. Skips the snapshot when
 * the content is unchanged from the last version or when the previous snapshot
 * is more recent than {@link VERSION_THROTTLE_MS}, so a burst of autosaves
 * produces at most one periodic history entry.
 * @param {number} noteId - Note whose current content should be preserved.
 * @param {boolean} [force] - Bypass the time throttle (still dedups identical content).
 */
function captureNoteVersion(noteId, force = false) {
  const db = getDb()
  const cur = db.prepare('SELECT content, plain_text FROM notes WHERE id = ?').get(noteId)
  if (!cur) return
  const last = db
    .prepare(
      'SELECT content, created_at FROM note_versions WHERE note_id = ? ORDER BY id DESC LIMIT 1'
    )
    .get(noteId)
  if (last) {
    if (last.content === cur.content) return
    if (!force && Date.now() - last.created_at < VERSION_THROTTLE_MS) return
  }
  db.prepare(
    'INSERT INTO note_versions (note_id, content, plain_text, created_at) VALUES (?, ?, ?, ?)'
  ).run(noteId, cur.content, cur.plain_text, Date.now())
  db.prepare(
    `DELETE FROM note_versions
      WHERE note_id = ?
        AND id NOT IN (SELECT id FROM note_versions WHERE note_id = ? ORDER BY id DESC LIMIT ?)`
  ).run(noteId, noteId, MAX_VERSIONS_PER_NOTE)
}

/**
 * Lists a note's saved versions (newest first) without their full HTML, for a
 * lightweight history picker.
 * @param {number} noteId - Note id.
 * @returns {Array<{id: number, plain_text: string, created_at: number}>}
 */
export function listNoteVersions(noteId) {
  return getDb()
    .prepare(
      'SELECT id, plain_text, created_at FROM note_versions WHERE note_id = ? ORDER BY id DESC'
    )
    .all(noteId)
}

/**
 * Restores a note to one of its saved versions. The note's current content is
 * snapshotted first, so a restore is itself reversible.
 * @param {number} noteId - Note id.
 * @param {number} versionId - Version id to restore.
 * @returns {object|null} The updated note, or null if the version is missing.
 */
export function restoreNoteVersion(noteId, versionId) {
  const db = getDb()
  const version = db
    .prepare('SELECT content, plain_text FROM note_versions WHERE id = ? AND note_id = ?')
    .get(versionId, noteId)
  if (!version) return null
  captureNoteVersion(noteId, true)
  db.prepare('UPDATE notes SET content = ?, plain_text = ?, updated_at = ? WHERE id = ?').run(
    version.content,
    version.plain_text,
    Date.now(),
    noteId
  )
  return getNote(noteId)
}

/**
 * Locks or unlocks every non-trashed note in the active profile.
 * @param {boolean|number} locked - Truthy to lock.
 */
export function setAllNotesLocked(locked) {
  getDb()
    .prepare(
      'UPDATE notes SET locked = ?, updated_at = ? WHERE profile_id = ? AND deleted_at IS NULL'
    )
    .run(locked ? 1 : 0, Date.now(), currentProfileId)
}

/** Moves a note to the trash (soft delete). @param {number} id @returns {object} */
export function trashNote(id) {
  getDb().prepare('UPDATE notes SET deleted_at = ? WHERE id = ?').run(Date.now(), id)
  return getNote(id)
}

/** Restores a note from the trash. @param {number} id @returns {object} */
export function restoreNote(id) {
  getDb().prepare('UPDATE notes SET deleted_at = NULL, hidden = 0 WHERE id = ?').run(id)
  return getNote(id)
}

/** Permanently deletes a note. @param {number} id */
export function deleteNoteForever(id) {
  getDb().prepare('DELETE FROM notes WHERE id = ?').run(id)
}

/** Permanently empties the active profile's trash. */
export function emptyTrash() {
  getDb()
    .prepare('DELETE FROM notes WHERE deleted_at IS NOT NULL AND profile_id = ?')
    .run(currentProfileId)
}

/**
 * Merges two or more notes into the first, trashing the rest. Runs in a
 * transaction so the operation is all-or-nothing.
 * @param {number[]} ids - Note ids, first is the merge target.
 * @returns {object|null} The merged note, or null if fewer than two valid notes.
 */
export function mergeNotes(ids) {
  const db = getDb()
  if (!Array.isArray(ids) || ids.length < 2) return null
  const notes = ids.map((id) => getNote(id)).filter(Boolean)
  if (notes.length < 2) return null
  const target = notes[0]
  const mergedContent = notes.map((n) => n.content).join('<hr>')
  const mergedPlain = notes.map((n) => n.plain_text).join('\n')
  const tx = db.transaction(() => {
    updateNote(target.id, { content: mergedContent, plain_text: mergedPlain })
    for (const n of notes.slice(1)) trashNote(n.id)
  })
  tx()
  return getNote(target.id)
}

/**
 * Duplicates a note, offsetting the copy slightly so it does not fully overlap.
 * @param {number} id - Source note id.
 * @returns {object|null} The new note, or null if the source is missing.
 */
export function duplicateNote(id) {
  const src = getNote(id)
  if (!src) return null
  return createNote({
    notebook_id: src.notebook_id,
    content: src.content,
    plain_text: src.plain_text,
    color: src.color,
    opacity: src.opacity,
    font_size: src.font_size,
    x: src.x != null ? src.x + 24 : null,
    y: src.y != null ? src.y + 24 : null,
    width: src.width,
    height: src.height
  })
}

/**
 * Searches note text (via the FTS5 index) and tag names in the active profile.
 * Falls back to a LIKE scan if the FTS index is unavailable in this SQLite build.
 * @param {string} query - Search term.
 * @returns {object[]} Matching notes with tags, most-recently-updated first.
 */
export function searchNotes(query) {
  const db = getDb()
  const like = `%${query}%`
  const match = toFtsQuery(query)
  const ids = new Set()

  try {
    if (match) {
      const rows = db
        .prepare(
          `SELECT n.id FROM notes_fts JOIN notes n ON n.id = notes_fts.rowid
            WHERE notes_fts MATCH ? AND n.profile_id = ? AND n.deleted_at IS NULL AND n.archived_at IS NULL`
        )
        .all(match, currentProfileId)
      for (const r of rows) ids.add(r.id)
    }
    // Tag-name matches are not covered by the note-text index.
    const tagRows = db
      .prepare(
        `SELECT DISTINCT n.id FROM notes n
           JOIN note_tags nt ON nt.note_id = n.id
           JOIN tags t ON t.id = nt.tag_id
          WHERE t.name LIKE ? AND n.profile_id = ? AND n.deleted_at IS NULL AND n.archived_at IS NULL`
      )
      .all(like, currentProfileId)
    for (const r of tagRows) ids.add(r.id)
  } catch {
    // No FTS5 support: fall back to a plain LIKE scan over text and tags.
    return attachTags(
      db
        .prepare(
          `SELECT DISTINCT n.* FROM notes n
             LEFT JOIN note_tags nt ON nt.note_id = n.id
             LEFT JOIN tags t ON t.id = nt.tag_id
            WHERE n.profile_id = ? AND n.deleted_at IS NULL AND n.archived_at IS NULL
              AND (n.plain_text LIKE ? OR t.name LIKE ?)
            ORDER BY n.updated_at DESC`
        )
        .all(currentProfileId, like, like)
    )
  }

  if (!ids.size) return []
  const ordered = [...ids]
  const placeholders = ordered.map(() => '?').join(',')
  return attachTags(
    db
      .prepare(`SELECT * FROM notes WHERE id IN (${placeholders}) ORDER BY updated_at DESC`)
      .all(...ordered)
  )
}

/**
 * Searches notes across *other* profiles for a global "find anything" jump.
 * Password-protected profiles are excluded so their notes never leak; the active
 * profile is excluded because those results come from {@link searchNotes}.
 * @param {string} query - Search term.
 * @returns {object[]} Matching notes, each with a `profile_name`.
 */
export function searchAllProfiles(query) {
  const like = `%${query}%`
  return getDb()
    .prepare(
      `SELECT n.*, p.name AS profile_name FROM notes n
         JOIN profiles p ON p.id = n.profile_id
        WHERE p.password_hash IS NULL AND p.id != ?
          AND n.deleted_at IS NULL AND n.archived_at IS NULL
          AND n.plain_text LIKE ?
        ORDER BY n.updated_at DESC LIMIT 40`
    )
    .all(currentProfileId, like)
}

// ---------------------------------------------------------------------------
// Notebooks (categories)
// ---------------------------------------------------------------------------

/** @returns {number|null} The active profile's first category id, or null. */
export function getDefaultNotebookId() {
  const row = getDb()
    .prepare('SELECT id FROM notebooks WHERE profile_id = ? ORDER BY sort_order, id LIMIT 1')
    .get(currentProfileId)
  return row ? row.id : null
}

/** Lists the active profile's categories with active-note counts. @returns {object[]} */
export function listNotebooks() {
  return getDb()
    .prepare(
      `SELECT nb.*, (SELECT COUNT(*) FROM notes n
         WHERE n.notebook_id = nb.id AND n.deleted_at IS NULL) AS note_count
       FROM notebooks nb WHERE nb.profile_id = ? ORDER BY nb.sort_order, nb.id`
    )
    .all(currentProfileId)
}

/** @param {string} name @returns {object} The created category. */
export function createNotebook(name) {
  const db = getDb()
  const max = db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM notebooks WHERE profile_id = ?')
    .get(currentProfileId).m
  const info = db
    .prepare('INSERT INTO notebooks (name, sort_order, profile_id, created_at) VALUES (?, ?, ?, ?)')
    .run(name, max + 1, currentProfileId, Date.now())
  return db.prepare('SELECT * FROM notebooks WHERE id = ?').get(info.lastInsertRowid)
}

/** @param {number} id @param {string} name */
export function renameNotebook(id, name) {
  getDb().prepare('UPDATE notebooks SET name = ? WHERE id = ?').run(name, id)
}

/**
 * Deletes a category, first moving its notes to another category in the same
 * profile (their `notebook_id` would otherwise be set to NULL).
 * @param {number} id - Category id.
 */
export function deleteNotebook(id) {
  const db = getDb()
  const fallback = db
    .prepare(
      'SELECT id FROM notebooks WHERE id != ? AND profile_id = ? ORDER BY sort_order, id LIMIT 1'
    )
    .get(id, currentProfileId)
  const tx = db.transaction(() => {
    if (fallback) {
      db.prepare('UPDATE notes SET notebook_id = ? WHERE notebook_id = ?').run(fallback.id, id)
    }
    db.prepare('DELETE FROM notebooks WHERE id = ?').run(id)
  })
  tx()
}

// ---------------------------------------------------------------------------
// Alarms
// ---------------------------------------------------------------------------

/** @param {number} noteId @returns {object|undefined} The note's alarm, if any. */
export function getAlarmForNote(noteId) {
  return getDb()
    .prepare('SELECT * FROM alarms WHERE note_id = ? ORDER BY id DESC LIMIT 1')
    .get(noteId)
}

/**
 * Creates or updates the alarm for a note.
 * @param {number} noteId - Note id.
 * @param {number} triggerAt - Trigger time (epoch ms).
 * @param {'once'|'daily'|'weekly'|'monthly'|'yearly'} [repeatMode] - Repeat mode.
 * @returns {object} The alarm row.
 */
export function setAlarm(noteId, triggerAt, repeatMode = 'once') {
  const db = getDb()
  const existing = getAlarmForNote(noteId)
  if (existing) {
    db.prepare(
      'UPDATE alarms SET trigger_at = ?, repeat_mode = ?, enabled = 1, last_fired_at = NULL WHERE id = ?'
    ).run(triggerAt, repeatMode, existing.id)
    return db.prepare('SELECT * FROM alarms WHERE id = ?').get(existing.id)
  }
  const info = db
    .prepare('INSERT INTO alarms (note_id, trigger_at, repeat_mode, enabled) VALUES (?, ?, ?, 1)')
    .run(noteId, triggerAt, repeatMode)
  return db.prepare('SELECT * FROM alarms WHERE id = ?').get(info.lastInsertRowid)
}

/** Removes the alarm for a note. @param {number} noteId */
export function clearAlarm(noteId) {
  getDb().prepare('DELETE FROM alarms WHERE note_id = ?').run(noteId)
}

/**
 * Re-arms a note's alarm to fire again at a later time (snooze). The repeat
 * mode is preserved; a recurring alarm resumes its cycle from the snoozed time.
 * @param {number} noteId - Note id.
 * @param {number} triggerAt - New trigger time (epoch ms).
 * @returns {object|null} The updated alarm row, or null if the note has none.
 */
export function snoozeAlarm(noteId, triggerAt) {
  const db = getDb()
  const existing = getAlarmForNote(noteId)
  if (!existing) return null
  db.prepare(
    'UPDATE alarms SET trigger_at = ?, enabled = 1, last_fired_at = NULL WHERE id = ?'
  ).run(triggerAt, existing.id)
  return db.prepare('SELECT * FROM alarms WHERE id = ?').get(existing.id)
}

/**
 * Returns due, enabled alarms whose note belongs to the active profile and is
 * not trashed.
 * @param {number} [now] - Reference time (epoch ms).
 * @returns {object[]}
 */
export function getDueAlarms(now = Date.now()) {
  return getDb()
    .prepare(
      `SELECT a.* FROM alarms a JOIN notes n ON n.id = a.note_id
        WHERE a.enabled = 1 AND a.trigger_at <= ?
          AND n.profile_id = ? AND n.deleted_at IS NULL AND n.archived_at IS NULL`
    )
    .all(now, currentProfileId)
}

/**
 * Lists the active profile's enabled reminders (past-due and future) joined
 * with their note, soonest first — the data behind the Explorer agenda.
 * @param {number} [limit] - Maximum rows to return.
 * @returns {object[]} Rows of { alarm_id, trigger_at, repeat_mode, note_id, plain_text, color }.
 */
export function getUpcomingAlarms(limit = 50) {
  return getDb()
    .prepare(
      `SELECT a.id AS alarm_id, a.trigger_at, a.repeat_mode,
              n.id AS note_id, n.plain_text, n.color
         FROM alarms a JOIN notes n ON n.id = a.note_id
        WHERE a.enabled = 1 AND n.profile_id = ?
          AND n.deleted_at IS NULL AND n.archived_at IS NULL
        ORDER BY a.trigger_at ASC LIMIT ?`
    )
    .all(currentProfileId, limit)
}

/**
 * Records that an alarm fired. For repeating alarms, advances `trigger_at`;
 * for one-shot alarms, disables it.
 * @param {number} id - Alarm id.
 * @param {number|null} nextTriggerAt - Next trigger time, or null for one-shot.
 */
export function markAlarmFired(id, nextTriggerAt) {
  const db = getDb()
  if (nextTriggerAt) {
    db.prepare('UPDATE alarms SET last_fired_at = ?, trigger_at = ? WHERE id = ?').run(
      Date.now(),
      nextTriggerAt,
      id
    )
  } else {
    db.prepare('UPDATE alarms SET last_fired_at = ?, enabled = 0 WHERE id = ?').run(Date.now(), id)
  }
}

// ---------------------------------------------------------------------------
// Tags (many-to-many via note_tags)
// ---------------------------------------------------------------------------

/** Lists the active profile's tags with active-note usage counts. @returns {object[]} */
export function listTags() {
  return getDb()
    .prepare(
      `SELECT t.*, (SELECT COUNT(*) FROM note_tags nt
          JOIN notes n ON n.id = nt.note_id
          WHERE nt.tag_id = t.id AND n.deleted_at IS NULL) AS note_count
       FROM tags t WHERE t.profile_id = ? ORDER BY t.name COLLATE NOCASE`
    )
    .all(currentProfileId)
}

/**
 * Creates a tag, or returns the existing one with the same name (case-insensitive)
 * in the active profile.
 * @param {string} name - Tag name.
 * @param {string} [color] - Tag color key.
 * @returns {object|null} The tag, or null for an empty name.
 */
export function createTag(name, color = 'slate') {
  const db = getDb()
  const trimmed = name.trim()
  if (!trimmed) return null
  const existing = db
    .prepare('SELECT * FROM tags WHERE name = ? COLLATE NOCASE AND profile_id = ?')
    .get(trimmed, currentProfileId)
  if (existing) return existing
  const info = db
    .prepare('INSERT INTO tags (name, color, profile_id, created_at) VALUES (?, ?, ?, ?)')
    .run(trimmed, color, currentProfileId, Date.now())
  return db.prepare('SELECT * FROM tags WHERE id = ?').get(info.lastInsertRowid)
}

/** Adds a tag to a note (idempotent). @param {number} noteId @param {number} tagId */
export function addTagToNote(noteId, tagId) {
  getDb()
    .prepare('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)')
    .run(noteId, tagId)
}

/** Removes a tag from a note. @param {number} noteId @param {number} tagId */
export function removeTagFromNote(noteId, tagId) {
  getDb().prepare('DELETE FROM note_tags WHERE note_id = ? AND tag_id = ?').run(noteId, tagId)
}

/**
 * Permanently deletes a tag from the active profile. Its note associations are
 * removed automatically (note_tags cascades on the tag foreign key).
 * @param {number} tagId - Tag id.
 */
export function deleteTag(tagId) {
  getDb().prepare('DELETE FROM tags WHERE id = ? AND profile_id = ?').run(tagId, currentProfileId)
}

// ---------------------------------------------------------------------------
// Import / export (portable JSON)
// ---------------------------------------------------------------------------

/**
 * Resolves a category by name in the active profile, creating it if absent.
 * @param {string} name - Category name.
 * @returns {number|null} The category id.
 */
function resolveOrCreateNotebook(name) {
  const trimmed = String(name || '').trim()
  if (!trimmed) return getDefaultNotebookId()
  const existing = getDb()
    .prepare('SELECT id FROM notebooks WHERE name = ? COLLATE NOCASE AND profile_id = ?')
    .get(trimmed, currentProfileId)
  if (existing) return existing.id
  const created = createNotebook(trimmed)
  return created ? created.id : getDefaultNotebookId()
}

/**
 * Serialises the active profile's live (non-trashed) notes into a portable,
 * version-tagged JSON structure, with category names and tags inlined.
 * @returns {{format: string, version: number, exportedAt: string, notes: object[]}}
 */
export function exportProfileData() {
  const db = getDb()
  const notes = attachTags(
    db
      .prepare(
        'SELECT * FROM notes WHERE profile_id = ? AND deleted_at IS NULL ORDER BY created_at ASC'
      )
      .all(currentProfileId)
  )
  const nameById = new Map(listNotebooks().map((nb) => [nb.id, nb.name]))
  return {
    format: 'noteit-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    notes: (notes || []).map((n) => ({
      content: n.content,
      plain_text: n.plain_text,
      color: n.color,
      opacity: n.opacity,
      font_size: n.font_size,
      always_on_top: n.always_on_top,
      starred: n.starred,
      collapsed: n.collapsed,
      category: nameById.get(n.notebook_id) || null,
      tags: (n.tags || []).map((tag) => ({ name: tag.name, color: tag.color })),
      created_at: n.created_at,
      updated_at: n.updated_at
    }))
  }
}

/**
 * Imports notes from an exported JSON structure into the active profile,
 * creating any missing categories and tags by name. Note HTML is sanitised on
 * the way in (the file is untrusted input). Imported notes start hidden so they
 * populate the Explorer without flooding the desktop. The whole import runs in
 * one transaction.
 * @param {object} data - Parsed export payload (see {@link exportProfileData}).
 * @returns {{imported: number}} Number of notes imported.
 */
export function importNotesData(data) {
  const db = getDb()
  if (!data || !Array.isArray(data.notes)) return { imported: 0 }
  const tx = db.transaction(() => {
    let count = 0
    for (const raw of data.notes) {
      if (!raw || typeof raw !== 'object') continue
      const note = createNote({
        notebook_id: raw.category ? resolveOrCreateNotebook(raw.category) : getDefaultNotebookId(),
        content: typeof raw.content === 'string' ? sanitizeHtml(raw.content) : '',
        plain_text: typeof raw.plain_text === 'string' ? raw.plain_text : '',
        color: typeof raw.color === 'string' ? raw.color : 'yellow',
        opacity: typeof raw.opacity === 'number' ? raw.opacity : 1.0,
        font_size: Number.isInteger(raw.font_size) ? raw.font_size : 14,
        always_on_top: raw.always_on_top ? 1 : 0,
        starred: raw.starred ? 1 : 0,
        collapsed: raw.collapsed ? 1 : 0,
        hidden: 1
      })
      if (Array.isArray(raw.tags)) {
        for (const tg of raw.tags) {
          if (!tg || !tg.name) continue
          const tag = createTag(String(tg.name), typeof tg.color === 'string' ? tg.color : 'slate')
          if (tag) addTagToNote(note.id, tag.id)
        }
      }
      count++
    }
    return count
  })
  return { imported: tx() }
}

// ---------------------------------------------------------------------------
// Settings (key/value; internal to the main process)
// ---------------------------------------------------------------------------

/**
 * Reads a JSON-decoded setting.
 * @param {string} key - Setting key.
 * @param {*} [fallback] - Returned when the key is absent.
 * @returns {*} The stored value or `fallback`.
 */
export function getSetting(key, fallback = null) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key)
  if (!row) return fallback
  try {
    return JSON.parse(row.value)
  } catch {
    return row.value
  }
}

/**
 * Writes a JSON-encoded setting (upsert).
 * @param {string} key - Setting key.
 * @param {*} value - JSON-serialisable value.
 */
export function setSetting(key, value) {
  getDb()
    .prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
    .run(key, JSON.stringify(value))
}

// ---------------------------------------------------------------------------
// Saved filters (per-profile; category/tag/sort presets for the Explorer)
// ---------------------------------------------------------------------------

/**
 * Lists the saved Explorer filters for the current profile. Filters reference
 * profile-scoped category and tag ids, so they are stored per profile.
 * @returns {Array<object>} Saved filter presets (may be empty).
 */
export function getSavedFilters() {
  const list = getSetting(`saved_filters:${currentProfileId}`, [])
  return Array.isArray(list) ? list : []
}

/**
 * Replaces the current profile's saved Explorer filters.
 * @param {Array<object>} filters - The full list of presets to persist.
 * @returns {Array<object>} The persisted list.
 */
export function setSavedFilters(filters) {
  const list = Array.isArray(filters) ? filters : []
  setSetting(`saved_filters:${currentProfileId}`, list)
  return list
}
