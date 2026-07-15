/**
 * @file IPC surface for the renderer.
 *
 * Registers every `ipcMain` handler the preload bridge can call. Handlers are
 * thin: they validate/transform arguments, delegate persistence to the
 * repository, drive window side-effects, and notify affected windows so open
 * note windows and the Explorer stay in sync.
 */

import { ipcMain, dialog, BrowserWindow, app, shell, clipboard } from 'electron'
import { writeFileSync, readFileSync, copyFileSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import * as repo from './repository.js'
import { backupTo, getDbPath, isValidDatabaseFile, closeDatabase } from './database.js'
import {
  openNote,
  hideNoteWindow,
  applyNoteWindowState,
  sendToNote,
  refreshExplorer,
  openExplorer,
  openSettingsWindow,
  getNoteWindow,
  getAllNoteWindowIds,
  closeAllNoteWindows,
  restoreVisibleNotes,
  openOptionsWindow,
  closeOptionsWindow,
  resizeOptionsWindow,
  broadcastToAllWindows
} from './windows.js'
import { hashPassword, verifyPassword } from './password.js'
import log from './logger.js'
import { t, setLocale, getLocale } from './i18n.js'
import { refreshTrayMenu } from './tray.js'
import { buildApplicationMenu } from './menu.js'
import { checkForUpdatesManually } from './updater.js'
import { htmlToPlainText, plainTextToRtf, htmlToMarkdown } from '../shared/exportFormat.js'
import { printNote, noteToPdf } from './printing.js'
import { applyGlobalShortcuts } from './shortcuts.js'
import { marked } from 'marked'

/**
 * Applies a language change everywhere: main-process locale, tray and app
 * menus, and all renderer windows.
 * @param {string} code - New locale code.
 */
function applyLanguageChange(code) {
  setLocale(code)
  refreshTrayMenu()
  buildApplicationMenu(() => openSettingsWindow())
  broadcastToAllWindows('locale:changed', code)
}

/** Direct reference so the {@link handle} wrapper isn't caught by find/replace. */
const rawHandle = ipcMain.handle.bind(ipcMain)

/**
 * Registers an invoke handler that logs and re-throws errors, so a failing
 * query surfaces in the logs (and rejects the renderer promise) instead of
 * crashing silently.
 * @param {string} channel - IPC channel.
 * @param {(event: Electron.IpcMainInvokeEvent, ...args: any[]) => any} fn - Handler.
 */
function handle(channel, fn) {
  rawHandle(channel, async (event, ...args) => {
    try {
      return await fn(event, ...args)
    } catch (err) {
      log.error(`IPC "${channel}" failed:`, err)
      throw err
    }
  })
}

/**
 * Switches the active profile: persists the choice, closes the previous
 * profile's note windows and opens the new profile's visible notes.
 *
 * @param {number} id - Profile id to activate.
 */
function switchToProfile(id) {
  repo.setCurrentProfile(id)
  repo.setSetting('active_profile_id', id)
  closeAllNoteWindows()
  restoreVisibleNotes()
  refreshExplorer()
}

/** Registers all IPC handlers. Call once, after the database is initialised. */
export function registerIpc() {
  // --- Profiles -------------------------------------------------------------
  handle('profiles:list', () => repo.listProfiles())

  handle('profile:current', () => {
    const p = repo.getProfile(repo.getCurrentProfileId())
    return p ? { id: p.id, name: p.name, has_password: !!p.password_hash } : null
  })

  handle('profile:create', (_e, name, password) =>
    repo.createProfile(name, password ? hashPassword(password) : null)
  )

  handle('profile:rename', (_e, id, name) => {
    repo.renameProfile(id, name)
    refreshExplorer()
    return true
  })

  handle('profile:set-password', (_e, id, newPassword) => {
    repo.setProfilePasswordHash(id, newPassword ? hashPassword(newPassword) : null)
    refreshExplorer()
    return true
  })

  handle('profile:switch', (_e, id, password) => {
    const profile = repo.getProfile(id)
    if (!profile) return { ok: false, error: 'not-found' }
    if (profile.password_hash && !verifyPassword(password || '', profile.password_hash)) {
      return { ok: false, error: 'wrong-password' }
    }
    switchToProfile(id)
    return { ok: true }
  })

  handle('profile:delete', (_e, id, password) => {
    if (repo.countProfiles() <= 1) return { ok: false, error: 'last' }
    const profile = repo.getProfile(id)
    if (!profile) return { ok: false, error: 'not-found' }
    if (profile.password_hash && !verifyPassword(password || '', profile.password_hash)) {
      return { ok: false, error: 'wrong-password' }
    }
    const wasActive = repo.getCurrentProfileId() === id
    repo.deleteProfile(id)
    if (wasActive) {
      const next = repo.listProfiles()[0]
      if (next) switchToProfile(next.id)
    }
    refreshExplorer()
    return { ok: true }
  })

  // --- Notes ----------------------------------------------------------------
  handle('note:get', (_e, id) => repo.getNote(id))
  handle('notes:visible', () => repo.getVisibleNotes())
  handle('notes:active', () => repo.getActiveNotes())
  handle('notes:trashed', () => repo.getTrashedNotes())
  handle('notes:search', (_e, q) => repo.searchNotes(q))
  handle('notes:search-global', (_e, q) => repo.searchAllProfiles(q))

  handle('note:create', (_e, overrides) => {
    const note = repo.createNote(overrides || {})
    openNote(note.id)
    refreshExplorer()
    return note
  })

  handle('note:update', (_e, id, fields) => {
    const note = repo.updateNote(id, fields)
    applyNoteWindowState(id, fields)
    sendToNote(id, 'note:updated', note)
    refreshExplorer()
    return note
  })

  handle('note:open', (_e, id) => {
    openNote(id)
    return true
  })

  handle('note:trash', (_e, id) => {
    repo.trashNote(id)
    hideNoteWindow(id)
    refreshExplorer()
    return true
  })

  handle('note:restore', (_e, id) => {
    repo.restoreNote(id)
    openNote(id)
    refreshExplorer()
    return true
  })

  handle('notes:archived', () => repo.getArchivedNotes())
  handle('note:archive', (_e, id) => {
    repo.archiveNote(id)
    hideNoteWindow(id)
    refreshExplorer()
    return true
  })
  handle('note:unarchive', (_e, id) => {
    repo.unarchiveNote(id)
    refreshExplorer()
    return true
  })

  // Applies one action to many selected notes at once.
  handle('notes:bulk', (_e, ids, action, value) => {
    if (!Array.isArray(ids)) return { count: 0 }
    for (const id of ids) {
      if (action === 'trash') repo.trashNote(id)
      else if (action === 'archive') repo.archiveNote(id)
      else if (action === 'tag') repo.addTagToNote(id, value)
      else if (action === 'color') repo.updateNote(id, { color: value })
      else if (action === 'category') repo.updateNote(id, { notebook_id: value })
      else if (action === 'star') repo.updateNote(id, { starred: value ? 1 : 0 })
    }
    for (const id of ids) {
      if (action === 'trash' || action === 'archive') hideNoteWindow(id)
      else sendToNote(id, 'note:updated', repo.getNote(id))
    }
    refreshExplorer()
    return { count: ids.length }
  })

  handle('note:delete-forever', (_e, id) => {
    hideNoteWindow(id)
    repo.deleteNoteForever(id)
    refreshExplorer()
    return true
  })

  handle('trash:empty', () => {
    repo.emptyTrash()
    refreshExplorer()
    return true
  })

  handle('notes:lock-all', (_e, locked) => {
    repo.setAllNotesLocked(locked)
    const val = locked ? 1 : 0
    for (const id of getAllNoteWindowIds()) {
      applyNoteWindowState(id, { locked: val })
      sendToNote(id, 'note:updated', repo.getNote(id))
    }
    refreshExplorer()
    return true
  })

  handle('note:duplicate', (_e, id) => {
    const note = repo.duplicateNote(id)
    if (note) openNote(note.id)
    refreshExplorer()
    return note
  })

  handle('note:merge', (_e, ids) => {
    const note = repo.mergeNotes(ids)
    if (note) {
      for (const id of ids) if (id !== note.id) hideNoteWindow(id)
      sendToNote(note.id, 'note:updated', note)
    }
    refreshExplorer()
    return note
  })

  // --- Notebooks (categories) ----------------------------------------------
  handle('notebooks:list', () => repo.listNotebooks())
  handle('notebook:create', (_e, name) => repo.createNotebook(name))
  handle('notebook:rename', (_e, id, name) => {
    repo.renameNotebook(id, name)
    refreshExplorer()
    return true
  })
  handle('notebook:delete', (_e, id) => {
    repo.deleteNotebook(id)
    refreshExplorer()
    return true
  })

  // --- Tags -----------------------------------------------------------------
  handle('tags:list', () => repo.listTags())
  handle('tag:create', (_e, name, color) => repo.createTag(name, color))
  handle('tag:delete', (_e, tagId) => {
    repo.deleteTag(tagId)
    // Refresh any open note windows so the removed tag disappears from their chips.
    for (const id of getAllNoteWindowIds()) sendToNote(id, 'note:updated', repo.getNote(id))
    refreshExplorer()
    return true
  })
  handle('note:add-tag', (_e, noteId, tagId) => {
    repo.addTagToNote(noteId, tagId)
    const note = repo.getNote(noteId)
    sendToNote(noteId, 'note:updated', note)
    refreshExplorer()
    return note
  })
  handle('note:remove-tag', (_e, noteId, tagId) => {
    repo.removeTagFromNote(noteId, tagId)
    const note = repo.getNote(noteId)
    sendToNote(noteId, 'note:updated', note)
    refreshExplorer()
    return note
  })

  // --- Note version history -------------------------------------------------
  handle('note:versions', (_e, noteId) => repo.listNoteVersions(noteId))
  handle('note:restore-version', (_e, noteId, versionId) => {
    const note = repo.restoreNoteVersion(noteId, versionId)
    if (note) {
      sendToNote(noteId, 'note:updated', note)
      refreshExplorer()
    }
    return note
  })

  // --- Alarms ---------------------------------------------------------------
  handle('alarm:get', (_e, noteId) => repo.getAlarmForNote(noteId))
  handle('alarm:set', (_e, noteId, triggerAt, repeatMode) => {
    const alarm = repo.setAlarm(noteId, triggerAt, repeatMode)
    sendToNote(noteId, 'note:alarm-changed', alarm)
    return alarm
  })
  handle('alarm:clear', (_e, noteId) => {
    repo.clearAlarm(noteId)
    sendToNote(noteId, 'note:alarm-changed', null)
    return true
  })

  // --- Options popup window -------------------------------------------------
  handle('options:open', (_e, noteId, anchor) => {
    openOptionsWindow(noteId, anchor)
    return true
  })
  handle('options:close', () => {
    closeOptionsWindow()
    return true
  })
  handle('options:resize', (_e, w, h) => {
    resizeOptionsWindow(w, h)
    return true
  })
  handle('options:action', (_e, action, noteId) => {
    // The alarm and history dialogs live inside the note window, so hand these
    // requests back to it.
    const channel =
      action === 'alarm' ? 'note:open-alarm' : action === 'history' ? 'note:open-history' : null
    if (channel) {
      closeOptionsWindow()
      const w = getNoteWindow(noteId)
      if (w) {
        w.show()
        w.focus()
      }
      sendToNote(noteId, channel, { noteId })
    }
    return true
  })

  // --- Explorer -------------------------------------------------------------
  handle('explorer:open', () => {
    openExplorer()
    return true
  })

  // --- Settings -------------------------------------------------------------
  handle('settings:get', (_e, key, fallback) => repo.getSetting(key, fallback))
  handle('settings:set', (_e, key, value) => {
    repo.setSetting(key, value)
    if (key === 'launch_at_login') app.setLoginItemSettings({ openAtLogin: !!value })
    if (key === 'language') applyLanguageChange(value)
    if (key === 'theme') broadcastToAllWindows('theme:changed', value)
    if (key.startsWith('shortcut_')) applyGlobalShortcuts()
    return true
  })
  handle('settings:open', () => {
    openSettingsWindow()
    return true
  })

  // --- Saved filters (per-profile Explorer presets) -------------------------
  handle('filters:list', () => repo.getSavedFilters())
  handle('filters:save', (_e, filters) => repo.setSavedFilters(filters))
  // The active locale resolved by the main process (saved preference or OS).
  handle('locale:current', () => getLocale())
  handle('app:info', () => ({
    version: app.getVersion(),
    name: app.getName(),
    packaged: app.isPackaged
  }))
  handle('update:check', () => {
    // Auto-update only works in a packaged build with a configured provider.
    if (!app.isPackaged) return { ok: false, reason: 'unsupported' }
    checkForUpdatesManually()
    return { ok: true }
  })
  handle('app:reveal-data', () => {
    shell.showItemInFolder(getDbPath())
    return true
  })

  // --- Backup / restore -----------------------------------------------------
  handle('backup:create', async () => {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: t('dialog.backupTitle'),
      defaultPath: join(app.getPath('documents'), `noteit-backup-${stamp}.db`),
      filters: [{ name: t('dialog.backupFilter'), extensions: ['db'] }]
    })
    if (canceled || !filePath) return { ok: false }
    backupTo(filePath)
    return { ok: true, path: filePath }
  })

  handle('backup:restore', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: t('dialog.restoreTitle'),
      properties: ['openFile'],
      filters: [{ name: t('dialog.backupFilter'), extensions: ['db'] }]
    })
    if (canceled || !filePaths?.length) return { ok: false }

    // Refuse to overwrite live data with a corrupt or non-NoteIt file.
    if (!isValidDatabaseFile(filePaths[0])) {
      await dialog.showMessageBox({
        type: 'error',
        buttons: [t('dialog.cancel')],
        title: t('dialog.restoreInvalidTitle'),
        message: t('dialog.restoreInvalidTitle'),
        detail: t('dialog.restoreInvalid')
      })
      return { ok: false, error: 'invalid' }
    }

    const confirm = await dialog.showMessageBox({
      type: 'warning',
      buttons: [t('dialog.cancel'), t('dialog.restoreConfirm')],
      defaultId: 1,
      cancelId: 0,
      message: t('dialog.restoreMessage')
    })
    if (confirm.response !== 1) return { ok: false }

    // Close the live connection and drop stale WAL/SHM sidecars so SQLite does
    // not replay the previous database's journal onto the restored file.
    closeDatabase()
    const dbPath = getDbPath()
    copyFileSync(filePaths[0], dbPath)
    for (const suffix of ['-wal', '-shm']) {
      const sidecar = dbPath + suffix
      if (existsSync(sidecar)) {
        try {
          unlinkSync(sidecar)
        } catch {
          // ignore
        }
      }
    }
    app.relaunch()
    app.exit(0)
    return { ok: true }
  })

  // --- Export ---------------------------------------------------------------
  handle('note:export', async (_e, id, format) => {
    const note = repo.getNote(id)
    if (!note) return { ok: false }
    const ext = ['rtf', 'html', 'md'].includes(format) ? format : 'txt'
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: t('dialog.exportTitle'),
      defaultPath: join(app.getPath('documents'), `note-${id}.${ext}`),
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
    })
    if (canceled || !filePath) return { ok: false }
    const data =
      ext === 'html'
        ? note.content
        : ext === 'md'
          ? htmlToMarkdown(note.content)
          : ext === 'rtf'
            ? plainTextToRtf(htmlToPlainText(note.content))
            : htmlToPlainText(note.content)
    writeFileSync(filePath, data, 'utf8')
    return { ok: true, path: filePath }
  })

  // Copies the note as Markdown to the system clipboard.
  handle('note:copy-markdown', (_e, id) => {
    const note = repo.getNote(id)
    if (!note) return { ok: false }
    clipboard.writeText(htmlToMarkdown(note.content))
    return { ok: true }
  })

  // Captures the open note window as a PNG image.
  handle('note:export-png', async (_e, id) => {
    const win = getNoteWindow(id)
    if (!win) return { ok: false }
    const image = await win.webContents.capturePage()
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: t('dialog.exportTitle'),
      defaultPath: join(app.getPath('documents'), `note-${id}.png`),
      filters: [{ name: 'PNG', extensions: ['png'] }]
    })
    if (canceled || !filePath) return { ok: false }
    writeFileSync(filePath, image.toPNG())
    return { ok: true, path: filePath }
  })

  // Renders the note content to a PDF file.
  handle('note:export-pdf', async (_e, id) => {
    const note = repo.getNote(id)
    if (!note) return { ok: false }
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: t('dialog.exportTitle'),
      defaultPath: join(app.getPath('documents'), `note-${id}.pdf`),
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (canceled || !filePath) return { ok: false }
    writeFileSync(filePath, await noteToPdf(note))
    return { ok: true, path: filePath }
  })

  // Prints the note content via the system print dialog.
  handle('note:print', async (_e, id) => {
    const note = repo.getNote(id)
    if (!note) return { ok: false }
    return { ok: await printNote(note) }
  })

  // --- Bulk data import / export (JSON) -------------------------------------
  handle('data:export', async () => {
    const stamp = new Date().toISOString().slice(0, 10)
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: t('dialog.exportDataTitle'),
      defaultPath: join(app.getPath('documents'), `noteit-notes-${stamp}.json`),
      filters: [{ name: t('dialog.dataFilter'), extensions: ['json'] }]
    })
    if (canceled || !filePath) return { ok: false }
    const payload = repo.exportProfileData()
    writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8')
    return { ok: true, path: filePath, count: payload.notes.length }
  })

  handle('data:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: t('dialog.importDataTitle'),
      properties: ['openFile'],
      filters: [{ name: t('dialog.dataFilter'), extensions: ['json'] }]
    })
    if (canceled || !filePaths?.length) return { ok: false }
    let data
    try {
      data = JSON.parse(readFileSync(filePaths[0], 'utf8'))
    } catch {
      data = null
    }
    if (!data || data.format !== 'noteit-export' || !Array.isArray(data.notes)) {
      await dialog.showMessageBox({
        type: 'error',
        buttons: [t('dialog.cancel')],
        title: t('dialog.importInvalidTitle'),
        message: t('dialog.importInvalidTitle'),
        detail: t('dialog.importInvalid')
      })
      return { ok: false, error: 'invalid' }
    }
    const { imported } = repo.importNotesData(data)
    refreshExplorer()
    return { ok: true, count: imported }
  })

  // Imports Markdown/text files (one note per file) into the active profile.
  handle('data:import-markdown', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: t('dialog.importMarkdownTitle'),
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: t('dialog.markdownFilter'), extensions: ['md', 'markdown', 'txt'] }]
    })
    if (canceled || !filePaths?.length) return { ok: false }
    let imported = 0
    for (const fp of filePaths) {
      try {
        const html = marked.parse(readFileSync(fp, 'utf8'), { async: false })
        repo.createNote({ content: html, plain_text: htmlToPlainText(html), hidden: 1 })
        imported++
      } catch (err) {
        log.error('Markdown import failed for', fp, err)
      }
    }
    refreshExplorer()
    return { ok: true, count: imported }
  })

  // --- Frameless window controls -------------------------------------------
  ipcMain.on('win:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close())

  handle('win:note-close', (_e, id) => {
    // A note window's close button hides it from the desktop (does not delete).
    repo.updateNote(id, { hidden: 1 })
    hideNoteWindow(id)
    refreshExplorer()
    return true
  })
}
