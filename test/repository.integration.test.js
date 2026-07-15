/**
 * Integration tests for the SQLite database and repository layer.
 *
 * These exercise the real better-sqlite3 module against a temporary on-disk
 * database, covering profiles, notes, tags, categories, FTS5 search, version
 * history and JSON import/export.
 *
 * better-sqlite3 is a native module compiled for a specific ABI. On a developer
 * machine it is usually built for Electron and cannot load under plain Node, so
 * this whole suite auto-skips there; CI rebuilds it for Node (`npm rebuild
 * better-sqlite3`) so the suite runs in the pipeline. The `electron` and
 * `electron-log` modules are mocked because they are unavailable outside an
 * Electron runtime.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { tmpdir } from 'os'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'

/** Temp userData directory the mocked Electron `app.getPath` points at. */
let tmp = mkdtempSync(join(tmpdir(), 'noteit-test-'))

vi.mock('electron', () => ({
  app: {
    getPath: () => tmp,
    getLocale: () => 'en'
  }
}))

vi.mock('electron-log/main', () => ({
  default: {
    initialize() {},
    transports: { console: {}, file: {} },
    error() {},
    warn() {},
    info() {},
    debug() {}
  }
}))

// Skip the suite if the native module cannot load under the current runtime.
// The binding is loaded lazily on first `new Database`, so we must actually
// instantiate one — importing the module alone does not surface an ABI mismatch.
let dbAvailable = true
try {
  const { default: Database } = await import('better-sqlite3')
  new Database(':memory:').close()
} catch {
  dbAvailable = false
}

describe.skipIf(!dbAvailable)('database + repository (integration)', () => {
  let db
  let repo

  beforeAll(async () => {
    db = await import('../src/main/database.js')
    repo = await import('../src/main/repository.js')
  })

  beforeEach(() => {
    // Fresh database per test for isolation.
    db.closeDatabase()
    rmSync(tmp, { recursive: true, force: true })
    tmp = mkdtempSync(join(tmpdir(), 'noteit-test-'))
    db.initDatabase()
    repo.setCurrentProfile(1)
  })

  afterAll(() => {
    db.closeDatabase()
    rmSync(tmp, { recursive: true, force: true })
  })

  it('seeds a default profile and category on a fresh database', () => {
    expect(repo.listProfiles()).toHaveLength(1)
    expect(repo.listNotebooks().length).toBeGreaterThan(0)
  })

  it('stamps the schema version via PRAGMA user_version', () => {
    expect(db.getDb().pragma('user_version', { simple: true })).toBe(2)
  })

  it('has the archived_at column (migration v2 applied)', () => {
    const cols = db
      .getDb()
      .prepare('PRAGMA table_info(notes)')
      .all()
      .map((c) => c.name)
    expect(cols).toContain('archived_at')
  })

  it('creates and reads a note with defaults', () => {
    const note = repo.createNote({ content: '<p>Hi</p>', plain_text: 'Hi' })
    expect(note.id).toBeGreaterThan(0)
    expect(note.color).toBe('yellow')
    expect(repo.getNote(note.id).plain_text).toBe('Hi')
    expect(repo.getVisibleNotes()).toHaveLength(1)
  })

  it('updates only whitelisted fields', () => {
    const note = repo.createNote({})
    repo.updateNote(note.id, { color: 'blue', bogus: 'x' })
    const updated = repo.getNote(note.id)
    expect(updated.color).toBe('blue')
    expect('bogus' in updated).toBe(false)
  })

  it('soft-deletes, restores and permanently deletes notes', () => {
    const note = repo.createNote({})
    repo.trashNote(note.id)
    expect(repo.getVisibleNotes()).toHaveLength(0)
    expect(repo.getTrashedNotes()).toHaveLength(1)
    repo.restoreNote(note.id)
    expect(repo.getTrashedNotes()).toHaveLength(0)
    repo.deleteNoteForever(note.id)
    expect(repo.getNote(note.id)).toBeUndefined()
  })

  it('attaches tags to notes and counts usage', () => {
    const note = repo.createNote({})
    const tag = repo.createTag('Work', 'blue')
    repo.addTagToNote(note.id, tag.id)
    expect(repo.getNote(note.id).tags.map((t) => t.name)).toEqual(['Work'])
    // Same name (case-insensitive) returns the existing tag, not a duplicate.
    expect(repo.createTag('work').id).toBe(tag.id)
    expect(repo.listTags().find((t) => t.id === tag.id).note_count).toBe(1)
  })

  describe('full-text search', () => {
    it('finds notes by whole word and prefix', () => {
      repo.createNote({
        content: '<p>Grocery shopping list</p>',
        plain_text: 'Grocery shopping list'
      })
      repo.createNote({ content: '<p>Meeting agenda</p>', plain_text: 'Meeting agenda' })
      expect(repo.searchNotes('grocery').map((n) => n.plain_text)).toEqual([
        'Grocery shopping list'
      ])
      expect(repo.searchNotes('meet').map((n) => n.plain_text)).toEqual(['Meeting agenda'])
      expect(repo.searchNotes('zzz')).toHaveLength(0)
    })

    it('keeps the index in sync after edits and deletes', () => {
      const note = repo.createNote({ content: '<p>alpha</p>', plain_text: 'alpha' })
      repo.updateNote(note.id, { content: '<p>omega</p>', plain_text: 'omega' })
      expect(repo.searchNotes('alpha')).toHaveLength(0)
      expect(repo.searchNotes('omega')).toHaveLength(1)
      repo.deleteNoteForever(note.id)
      expect(repo.searchNotes('omega')).toHaveLength(0)
    })

    it('also matches on tag names', () => {
      const note = repo.createNote({ content: '<p>no keyword</p>', plain_text: 'no keyword' })
      const tag = repo.createTag('Urgent', 'red')
      repo.addTagToNote(note.id, tag.id)
      expect(repo.searchNotes('urgent')).toHaveLength(1)
    })
  })

  describe('version history', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    })
    afterEach(() => vi.useRealTimers())

    it('snapshots prior content and restores it reversibly', () => {
      const note = repo.createNote({ content: '<p>v1</p>', plain_text: 'v1' })
      repo.updateNote(note.id, { content: '<p>v2</p>', plain_text: 'v2' }) // snapshots v1
      const versions = repo.listNoteVersions(note.id)
      expect(versions).toHaveLength(1)
      expect(versions[0].plain_text).toBe('v1')

      // Restoring v1 snapshots the current v2 first, then applies v1.
      repo.restoreNoteVersion(note.id, versions[0].id)
      expect(repo.getNote(note.id).plain_text).toBe('v1')
      expect(repo.listNoteVersions(note.id).some((v) => v.plain_text === 'v2')).toBe(true)
    })

    it('throttles rapid edits but snapshots again after the interval', () => {
      const note = repo.createNote({ content: '<p>a</p>', plain_text: 'a' })
      repo.updateNote(note.id, { content: '<p>b</p>', plain_text: 'b' }) // snapshots a
      repo.updateNote(note.id, { content: '<p>c</p>', plain_text: 'c' }) // throttled (within 90s)
      expect(repo.listNoteVersions(note.id)).toHaveLength(1)

      vi.setSystemTime(new Date('2026-01-01T00:05:00Z')) // +5 min
      repo.updateNote(note.id, { content: '<p>d</p>', plain_text: 'd' }) // snapshots c
      const texts = repo.listNoteVersions(note.id).map((v) => v.plain_text)
      expect(texts).toContain('c')
      expect(texts).toHaveLength(2)
    })
  })

  describe('import / export', () => {
    it('round-trips notes, categories and tags through JSON', () => {
      const nb = repo.createNotebook('Projects')
      const note = repo.createNote({
        notebook_id: nb.id,
        content: '<p>export me</p>',
        plain_text: 'export me',
        color: 'green',
        starred: 1
      })
      const tag = repo.createTag('Alpha', 'violet')
      repo.addTagToNote(note.id, tag.id)

      const payload = repo.exportProfileData()
      expect(payload.format).toBe('noteit-export')
      expect(payload.notes).toHaveLength(1)
      expect(payload.notes[0]).toMatchObject({ category: 'Projects', color: 'green', starred: 1 })
      expect(payload.notes[0].tags).toEqual([{ name: 'Alpha', color: 'violet' }])

      // Import into a second, empty profile.
      const p2 = repo.createProfile('Second')
      repo.setCurrentProfile(p2.id)
      const { imported } = repo.importNotesData(payload)
      expect(imported).toBe(1)
      const active = repo.getActiveNotes()
      expect(active).toHaveLength(1)
      expect(active[0].plain_text).toBe('export me')
      expect(active[0].tags.map((t) => t.name)).toEqual(['Alpha'])
      expect(repo.listNotebooks().some((n) => n.name === 'Projects')).toBe(true)
    })

    it('ignores a payload without a notes array', () => {
      expect(repo.importNotesData({}).imported).toBe(0)
      expect(repo.importNotesData(null).imported).toBe(0)
    })
  })

  describe('profiles', () => {
    it('isolates notes per profile and cascades on delete', () => {
      repo.createNote({ plain_text: 'p1 note' })
      const p2 = repo.createProfile('P2')
      repo.setCurrentProfile(p2.id)
      repo.createNote({ plain_text: 'p2 note' })
      expect(repo.getActiveNotes()).toHaveLength(1)

      repo.setCurrentProfile(1)
      expect(repo.getActiveNotes()[0].plain_text).toBe('p1 note')

      repo.deleteProfile(p2.id)
      expect(repo.listProfiles().some((p) => p.id === p2.id)).toBe(false)
    })
  })

  describe('profile management', () => {
    it('counts, renames and (un)sets a password hash', () => {
      expect(repo.countProfiles()).toBe(1)
      const p = repo.createProfile('Renamed')
      expect(repo.countProfiles()).toBe(2)
      repo.renameProfile(p.id, 'After')
      expect(repo.getProfile(p.id).name).toBe('After')
      expect(repo.getProfile(p.id).password_hash).toBeNull()
      repo.setProfilePasswordHash(p.id, 'salt:hash')
      expect(repo.getProfile(p.id).password_hash).toBe('salt:hash')
      repo.setProfilePasswordHash(p.id, null)
      expect(repo.getProfile(p.id).password_hash).toBeNull()
    })

    it('rejects an empty profile name', () => {
      expect(repo.createProfile('   ')).toBeNull()
      expect(repo.createProfile('')).toBeNull()
    })

    it('global search spans unprotected profiles but excludes protected and current', () => {
      repo.createNote({ content: '<p>alpha here</p>', plain_text: 'alpha here' }) // profile 1
      const open = repo.createProfile('Open')
      const locked = repo.createProfile('Locked')
      repo.setProfilePasswordHash(locked.id, 'salt:hash')
      repo.setCurrentProfile(open.id)
      repo.createNote({ content: '<p>alpha in open</p>', plain_text: 'alpha in open' })
      repo.setCurrentProfile(locked.id)
      repo.createNote({ content: '<p>alpha secret</p>', plain_text: 'alpha secret' })

      repo.setCurrentProfile(1)
      const results = repo.searchAllProfiles('alpha')
      expect(results.map((n) => n.profile_name)).toContain('Open')
      expect(results.map((n) => n.profile_name)).not.toContain('Locked') // protected excluded
      expect(results.every((n) => n.profile_id === open.id)).toBe(true) // current profile excluded
    })

    it('exposes the active profile id and default notebook', () => {
      expect(repo.getCurrentProfileId()).toBe(1)
      expect(repo.getDefaultNotebookId()).toBeTruthy()
    })
  })

  describe('notebooks', () => {
    it('renames a category', () => {
      const nb = repo.createNotebook('Old')
      repo.renameNotebook(nb.id, 'New')
      expect(repo.listNotebooks().find((n) => n.id === nb.id).name).toBe('New')
    })

    it('moves notes to another category when one is deleted', () => {
      const a = repo.createNotebook('A')
      const note = repo.createNote({ notebook_id: a.id })
      repo.deleteNotebook(a.id)
      const moved = repo.getNote(note.id)
      expect(moved.notebook_id).not.toBe(a.id)
      expect(moved.notebook_id).toBeTruthy()
      expect(repo.listNotebooks().some((n) => n.id === a.id)).toBe(false)
    })

    it('counts active notes per category', () => {
      const nb = repo.createNotebook('Counted')
      repo.createNote({ notebook_id: nb.id })
      repo.createNote({ notebook_id: nb.id })
      expect(repo.listNotebooks().find((n) => n.id === nb.id).note_count).toBe(2)
    })
  })

  describe('alarms', () => {
    it('creates, updates, reads and clears an alarm', () => {
      const note = repo.createNote({})
      const at = Date.now() + 60000
      const alarm = repo.setAlarm(note.id, at, 'daily')
      expect(alarm.trigger_at).toBe(at)
      expect(alarm.repeat_mode).toBe('daily')
      expect(repo.getAlarmForNote(note.id).id).toBe(alarm.id)

      const updated = repo.setAlarm(note.id, at + 1000, 'weekly')
      expect(updated.id).toBe(alarm.id) // same row, not a duplicate
      expect(updated.trigger_at).toBe(at + 1000)

      repo.clearAlarm(note.id)
      expect(repo.getAlarmForNote(note.id)).toBeUndefined()
    })

    it('lists only due, enabled alarms of non-trashed notes', () => {
      const past = repo.createNote({})
      const future = repo.createNote({})
      repo.setAlarm(past.id, 1000, 'once')
      repo.setAlarm(future.id, Date.now() + 1e6, 'once')
      expect(repo.getDueAlarms(Date.now()).map((a) => a.note_id)).toContain(past.id)
      expect(repo.getDueAlarms(Date.now()).map((a) => a.note_id)).not.toContain(future.id)

      repo.trashNote(past.id)
      expect(repo.getDueAlarms(Date.now()).map((a) => a.note_id)).not.toContain(past.id)
    })

    it('advances repeats and disables one-shots on fire', () => {
      const note = repo.createNote({})
      const a = repo.setAlarm(note.id, 1000, 'daily')
      repo.markAlarmFired(a.id, 5000)
      expect(repo.getAlarmForNote(note.id)).toMatchObject({ trigger_at: 5000, enabled: 1 })
      repo.markAlarmFired(a.id, null)
      expect(repo.getAlarmForNote(note.id).enabled).toBe(0)
    })

    it('re-arms a fired alarm on snooze, keeping the repeat mode', () => {
      const note = repo.createNote({})
      const a = repo.setAlarm(note.id, 1000, 'weekly')
      repo.markAlarmFired(a.id, null) // one-shot disable path leaves enabled = 0
      expect(repo.getAlarmForNote(note.id).enabled).toBe(0)

      const later = Date.now() + 600000
      const snoozed = repo.snoozeAlarm(note.id, later)
      expect(snoozed).toMatchObject({ trigger_at: later, enabled: 1, repeat_mode: 'weekly' })
      expect(snoozed.last_fired_at).toBeNull()
    })

    it('returns null when snoozing a note without an alarm', () => {
      const note = repo.createNote({})
      expect(repo.snoozeAlarm(note.id, Date.now() + 1000)).toBeNull()
    })

    it('lists upcoming reminders soonest first, excluding trashed and archived', () => {
      const soon = repo.createNote({ plain_text: 'soon' })
      const later = repo.createNote({ plain_text: 'later' })
      const gone = repo.createNote({ plain_text: 'gone' })
      const filed = repo.createNote({ plain_text: 'filed' })
      const base = Date.now() + 1e6
      repo.setAlarm(later.id, base + 2000, 'once')
      repo.setAlarm(soon.id, base + 1000, 'daily')
      repo.setAlarm(gone.id, base + 500, 'once')
      repo.setAlarm(filed.id, base + 500, 'once')
      repo.trashNote(gone.id)
      repo.archiveNote(filed.id)

      const rows = repo.getUpcomingAlarms()
      const ids = rows.map((r) => r.note_id)
      expect(ids).toEqual([soon.id, later.id]) // ordered, trashed + archived excluded
      expect(rows[0]).toMatchObject({ plain_text: 'soon', repeat_mode: 'daily' })
    })
  })

  describe('note operations', () => {
    it('duplicates a note with a position offset', () => {
      const src = repo.createNote({ plain_text: 'src', color: 'blue', x: 100, y: 100 })
      const copy = repo.duplicateNote(src.id)
      expect(copy.id).not.toBe(src.id)
      expect(copy).toMatchObject({ plain_text: 'src', color: 'blue', x: 124, y: 124 })
    })

    it('merges notes into the first and trashes the rest', () => {
      const a = repo.createNote({ content: '<p>a</p>', plain_text: 'a' })
      const b = repo.createNote({ content: '<p>b</p>', plain_text: 'b' })
      const merged = repo.mergeNotes([a.id, b.id])
      expect(merged.id).toBe(a.id)
      expect(merged.plain_text).toContain('a')
      expect(merged.plain_text).toContain('b')
      expect(repo.getNote(b.id).deleted_at).toBeTruthy()
    })

    it('returns null when merging fewer than two notes', () => {
      const a = repo.createNote({})
      expect(repo.mergeNotes([a.id])).toBeNull()
      expect(repo.mergeNotes([])).toBeNull()
    })

    it('locks and unlocks every active note', () => {
      repo.createNote({})
      repo.createNote({})
      repo.setAllNotesLocked(true)
      expect(repo.getActiveNotes().every((n) => n.locked === 1)).toBe(true)
      repo.setAllNotesLocked(false)
      expect(repo.getActiveNotes().every((n) => n.locked === 0)).toBe(true)
    })

    it('archives and unarchives notes (excluded from the active list and search)', () => {
      const note = repo.createNote({ content: '<p>archive me</p>', plain_text: 'archive me' })
      expect(repo.getActiveNotes()).toHaveLength(1)
      expect(repo.searchNotes('archive')).toHaveLength(1)

      repo.archiveNote(note.id)
      expect(repo.getActiveNotes()).toHaveLength(0)
      expect(repo.getVisibleNotes()).toHaveLength(0)
      expect(repo.searchNotes('archive')).toHaveLength(0)
      expect(repo.getArchivedNotes().map((n) => n.id)).toEqual([note.id])

      repo.unarchiveNote(note.id)
      expect(repo.getActiveNotes()).toHaveLength(1)
      expect(repo.getArchivedNotes()).toHaveLength(0)
    })

    it('empties the trash permanently', () => {
      const a = repo.createNote({})
      repo.trashNote(a.id)
      expect(repo.getTrashedNotes()).toHaveLength(1)
      repo.emptyTrash()
      expect(repo.getTrashedNotes()).toHaveLength(0)
      expect(repo.getNote(a.id)).toBeUndefined()
    })

    it('removes a tag from a note', () => {
      const note = repo.createNote({})
      const tag = repo.createTag('Temp')
      repo.addTagToNote(note.id, tag.id)
      expect(repo.getNote(note.id).tags).toHaveLength(1)
      repo.removeTagFromNote(note.id, tag.id)
      expect(repo.getNote(note.id).tags).toHaveLength(0)
    })

    it('deletes a tag entirely and cascades to note associations', () => {
      const a = repo.createNote({})
      const b = repo.createNote({})
      const tag = repo.createTag('Gone', 'red')
      repo.addTagToNote(a.id, tag.id)
      repo.addTagToNote(b.id, tag.id)
      repo.deleteTag(tag.id)
      expect(repo.listTags().some((t) => t.id === tag.id)).toBe(false)
      expect(repo.getNote(a.id).tags).toHaveLength(0)
      expect(repo.getNote(b.id).tags).toHaveLength(0)
    })
  })

  describe('settings', () => {
    it('stores and reads JSON values with a fallback', () => {
      expect(repo.getSetting('missing', 'fallback')).toBe('fallback')
      repo.setSetting('num', 42)
      expect(repo.getSetting('num')).toBe(42)
      repo.setSetting('obj', { a: [1, 2], b: 'x' })
      expect(repo.getSetting('obj')).toEqual({ a: [1, 2], b: 'x' })
      repo.setSetting('flag', true)
      expect(repo.getSetting('flag')).toBe(true)
    })

    it('upserts an existing key', () => {
      repo.setSetting('k', 'v1')
      repo.setSetting('k', 'v2')
      expect(repo.getSetting('k')).toBe('v2')
    })
  })

  describe('saved filters', () => {
    it('defaults to an empty list and round-trips presets', () => {
      expect(repo.getSavedFilters()).toEqual([])
      const preset = { id: 1, name: 'Starred', notebook: 'all', tag: null, sortBy: 'starred' }
      repo.setSavedFilters([preset])
      expect(repo.getSavedFilters()).toEqual([preset])
    })

    it('scopes presets per profile', () => {
      repo.setSavedFilters([{ id: 1, name: 'P1 filter' }])
      const p2 = repo.createProfile('P2')
      repo.setCurrentProfile(p2.id)
      expect(repo.getSavedFilters()).toEqual([])
      repo.setSavedFilters([{ id: 2, name: 'P2 filter' }])
      expect(repo.getSavedFilters()).toHaveLength(1)

      repo.setCurrentProfile(1)
      expect(repo.getSavedFilters()[0].name).toBe('P1 filter')
    })
  })
})
