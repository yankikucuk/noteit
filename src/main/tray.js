/**
 * @file System tray icon and menu.
 *
 * The app lives in the tray: double-clicking the icon creates a note, and the
 * context menu exposes the primary actions. On macOS a template image is used
 * so the icon adapts to the menu-bar theme.
 */

import { Tray, Menu, nativeImage, clipboard, app } from 'electron'
import trayIconPath from '../../resources/tray.png?asset'
import trayTemplatePath from '../../resources/trayTemplate.png?asset'
import { createNote, getActiveNotes, updateNote } from './repository.js'
import {
  openNote,
  openExplorer,
  openSettingsWindow,
  hideNoteWindow,
  getAllNoteWindowIds,
  refreshExplorer
} from './windows.js'
import { t } from './i18n.js'

/** @type {import('electron').Tray|null} */
let tray = null

/**
 * Escapes HTML special characters in clipboard text before embedding it in note HTML.
 * @param {string} s - Raw text.
 * @returns {string} Escaped text.
 */
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Creates a new note and opens its window.
 * @param {string} [content] - Initial HTML content.
 * @param {string} [plain] - Initial plain text (for search/preview).
 * @returns {object} The created note.
 */
export function newNote(content = '', plain = '') {
  const note = createNote({ content, plain_text: plain })
  openNote(note.id)
  refreshExplorer()
  return note
}

/** Creates a note from the current clipboard text (falls back to an empty note). */
function newFromClipboard() {
  const text = clipboard.readText().trim()
  if (!text) {
    newNote()
    return
  }
  const html = text
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
    .join('')
  newNote(html, text)
}

/** Shows every note in the active profile on the desktop. */
function showAllNotes() {
  for (const note of getActiveNotes()) {
    updateNote(note.id, { hidden: 0 })
    openNote(note.id)
  }
  refreshExplorer()
}

/** Hides every open note window (without deleting the notes). */
function hideAllNotes() {
  for (const id of getAllNoteWindowIds()) {
    updateNote(id, { hidden: 1 })
    hideNoteWindow(id)
  }
  refreshExplorer()
}

/** Builds and attaches the tray context menu (in the current language). */
function buildMenu() {
  const menu = Menu.buildFromTemplate([
    { label: t('tray.newNote'), accelerator: 'CmdOrCtrl+N', click: () => newNote() },
    { label: t('tray.newFromClipboard'), click: () => newFromClipboard() },
    { type: 'separator' },
    { label: t('tray.explorer'), accelerator: 'CmdOrCtrl+E', click: () => openExplorer() },
    { type: 'separator' },
    { label: t('tray.showAll'), click: () => showAllNotes() },
    { label: t('tray.hideAll'), click: () => hideAllNotes() },
    { type: 'separator' },
    { label: t('tray.settings'), click: () => openSettingsWindow() },
    { type: 'separator' },
    { label: t('tray.quit'), accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
  ])
  tray.setContextMenu(menu)
}

/** Rebuilds the tray menu (e.g. after a language change). */
export function refreshTrayMenu() {
  if (tray) buildMenu()
}

/** Creates the tray icon and its menu. Call once during app startup. */
export function createTray() {
  const isMac = process.platform === 'darwin'
  const img = nativeImage.createFromPath(isMac ? trayTemplatePath : trayIconPath)
  if (isMac) img.setTemplateImage(true)

  tray = new Tray(img)
  tray.setToolTip(t('tray.tooltip'))
  buildMenu()

  // Double-click creates a note (Simple Sticky Notes behaviour).
  tray.on('double-click', () => newNote())
  return tray
}
