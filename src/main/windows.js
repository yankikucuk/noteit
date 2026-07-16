/**
 * @file Window manager for the main process.
 *
 * Owns every renderer window the app can show:
 *  - one frameless {@link BrowserWindow} per sticky note (`note.html`),
 *  - a single Explorer window (`explorer.html`),
 *  - a transient options popup window (`options.html`).
 *
 * It also implements edge-snapping between note windows and persistence of
 * each note's on-screen bounds back into the database.
 */

import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { getNote, getVisibleNotes, updateNote, getSetting, setSetting } from './repository.js'
import { t } from './i18n.js'

/** Map of open note windows, keyed by note id. @type {Map<number, BrowserWindow>} */
const noteWindows = new Map()

/** The single Explorer window, or `null` when closed. @type {BrowserWindow|null} */
let explorerWindow = null

/** The transient options popup window, or `null` when closed. @type {BrowserWindow|null} */
let optionsWindow = null

/** Absolute path to the shared preload script (CommonJS, for sandbox support). */
const PRELOAD = join(import.meta.dirname, '../preload/index.cjs')

/** Collapsed note height; a rolled-up note shrinks to just its title bar. */
const TITLEBAR_H = 32

/** Snap threshold in pixels: windows closer than this align/stick to a neighbour. */
const SNAP = 12

/**
 * Resolves how a renderer page should be loaded for the current environment.
 * In development the Vite dev server is used; in production the built HTML file.
 *
 * @param {'note'|'explorer'|'options'} page - Renderer entry name.
 * @returns {{url: string}|{file: string}} Loader descriptor.
 */
function rendererEntry(page) {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    return { url: `${process.env['ELECTRON_RENDERER_URL']}/${page}.html` }
  }
  return { file: join(import.meta.dirname, `../renderer/${page}.html`) }
}

/**
 * Loads a renderer page into a window, forwarding a query string (e.g. the note id).
 *
 * @param {BrowserWindow} win - Target window.
 * @param {'note'|'explorer'|'options'} page - Renderer entry name.
 * @param {Record<string, string>} [query] - Query parameters.
 */
function loadPage(win, page, query = {}) {
  const entry = rendererEntry(page)
  if (entry.url) {
    const qs = new URLSearchParams(query).toString()
    win.loadURL(qs ? `${entry.url}?${qs}` : entry.url)
  } else {
    win.loadFile(entry.file, { query })
  }
}

/**
 * Hardens a window's web contents against navigation-based attacks: external
 * links (e.g. inside note text) open in the system browser and any attempt to
 * navigate the window away from its own page is blocked.
 *
 * @param {BrowserWindow} win - Window to harden.
 */
function hardenWebContents(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) {
      event.preventDefault()
      if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    }
  })
}

// ---------------------------------------------------------------------------
// Snapping & bounds persistence
// ---------------------------------------------------------------------------

/**
 * Aligns/sticks a just-moved window to the nearest neighbouring note window.
 * X-axis snapping only applies to vertically overlapping neighbours and
 * vice-versa, so distant windows are never affected.
 *
 * @param {number} noteId - Id of the moved note.
 * @param {BrowserWindow} win - The moved window.
 */
function snapWindow(noteId, win) {
  if (win.isDestroyed()) return
  const b = win.getBounds()
  const { width: w, height: h } = b
  let bestDx = SNAP + 1
  let bestDy = SNAP + 1
  let snapX = null
  let snapY = null

  for (const [otherId, other] of noteWindows) {
    if (otherId === noteId || !other || other.isDestroyed()) continue
    const o = other.getBounds()

    const verticallyNear = b.y < o.y + o.height + SNAP && b.y + h > o.y - SNAP
    const horizontallyNear = b.x < o.x + o.width + SNAP && b.x + w > o.x - SNAP

    if (verticallyNear) {
      // left-align, right-align, stick-to-right, stick-to-left
      for (const cx of [o.x, o.x + o.width - w, o.x + o.width, o.x - w]) {
        const d = Math.abs(b.x - cx)
        if (d <= SNAP && d < bestDx) {
          bestDx = d
          snapX = cx
        }
      }
    }
    if (horizontallyNear) {
      // top-align (title bars), bottom-align, stick-below, stick-above
      for (const cy of [o.y, o.y + o.height - h, o.y + o.height, o.y - h]) {
        const d = Math.abs(b.y - cy)
        if (d <= SNAP && d < bestDy) {
          bestDy = d
          snapY = cy
        }
      }
    }
  }

  const nx = snapX ?? b.x
  const ny = snapY ?? b.y
  if (nx !== b.x || ny !== b.y) {
    win.setBounds({ x: Math.round(nx), y: Math.round(ny), width: w, height: h }, false)
  }
}

/**
 * Nudges a window back into the visible work area if it would open off-screen
 * (e.g. after a monitor was disconnected since it was last positioned).
 * @param {BrowserWindow} win - Window to check.
 */
function ensureOnScreen(win) {
  const b = win.getBounds()
  const area = screen.getDisplayMatching(b).workArea
  let { x, y } = b
  if (x + b.width < area.x + 40 || x > area.x + area.width - 40) x = area.x + 60
  if (y < area.y || y > area.y + area.height - 40) y = area.y + 60
  if (x !== b.x || y !== b.y) win.setPosition(x, y)
}

/** Debounce timers for auxiliary (Explorer/Settings) window bounds, keyed by settings key. */
const auxBoundsTimers = new Map()

/**
 * Restores an auxiliary window's saved size/position (clamped on-screen) and
 * persists future moves/resizes under the given settings key, so the Explorer
 * and Settings windows reopen where the user left them. Listens to `move`
 * (fires on every platform, unlike the macOS/Windows-only `moved`) with a
 * debounced write, and flushes immediately on close so a move-then-close never
 * loses the position.
 *
 * @param {BrowserWindow} win - The window to track.
 * @param {string} key - Settings key to store the bounds under.
 */
function trackWindowBounds(win, key) {
  const saved = getSetting(key, null)
  if (saved && typeof saved.width === 'number' && typeof saved.height === 'number') {
    win.setBounds({ x: saved.x, y: saved.y, width: saved.width, height: saved.height })
    ensureOnScreen(win)
  }
  const save = () => {
    if (win.isDestroyed()) return
    const bounds = win.getBounds()
    clearTimeout(auxBoundsTimers.get(key))
    auxBoundsTimers.set(
      key,
      setTimeout(() => setSetting(key, bounds), 400)
    )
  }
  win.on('move', save)
  win.on('resize', save)
  win.on('close', () => {
    clearTimeout(auxBoundsTimers.get(key))
    auxBoundsTimers.delete(key)
    if (!win.isDestroyed()) setSetting(key, win.getBounds())
  })
}

/** Debounce timers for bounds persistence, keyed by note id. @type {Map<number, NodeJS.Timeout>} */
const persistTimers = new Map()

/**
 * Debounced write of a note window's position/size to the database. A collapsed
 * note only persists its position, keeping its expanded size intact.
 *
 * @param {number} noteId - Note id.
 * @param {BrowserWindow} win - The note window.
 */
function persistBounds(noteId, win) {
  if (win.isDestroyed()) return
  const [x, y] = win.getPosition()
  const [width, height] = win.getSize()
  clearTimeout(persistTimers.get(noteId))
  persistTimers.set(
    noteId,
    setTimeout(() => {
      const note = getNote(noteId)
      if (!note) return
      if (note.collapsed) updateNote(noteId, { x, y })
      else updateNote(noteId, { x, y, width, height })
    }, 400)
  )
}

// ---------------------------------------------------------------------------
// Note windows
// ---------------------------------------------------------------------------

/** Cascade counter so successive new notes don't stack exactly. */
let cascadeIndex = 0

/**
 * Computes a starting position for a new note (one without a saved position) on
 * the display under the cursor, cascading slightly so notes don't overlap.
 * @param {number} w - Window width.
 * @param {number} h - Window height.
 * @returns {{x: number, y: number}} Position on the active display.
 */
function activeDisplayPosition(w, h) {
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
  const step = (cascadeIndex++ % 8) * 28
  const x = area.x + Math.min(70 + step, Math.max(0, area.width - w - 20))
  const y = area.y + Math.min(70 + step, Math.max(0, area.height - h - 20))
  return { x, y }
}

/**
 * Reduces a note window's opacity when it loses focus (and restores it on focus)
 * if the "fade unfocused" preference is on, keeping the reduction relative to the
 * note's own opacity.
 * @param {number} noteId - Note id.
 * @param {BrowserWindow} win - The note window.
 */
function bindFocusFade(noteId, win) {
  const base = () => getNote(noteId)?.opacity ?? 1
  win.on('blur', () => {
    if (getSetting('fade_unfocused', false) && !win.isDestroyed()) win.setOpacity(base() * 0.7)
  })
  win.on('focus', () => {
    if (!win.isDestroyed()) win.setOpacity(base())
  })
}

/**
 * Creates a frameless note window and applies the note's persisted state
 * (size, position, opacity, always-on-top, locked, collapsed).
 *
 * @param {object} note - Note row from the database.
 * @returns {BrowserWindow} The created window.
 */
function createNoteWindow(note) {
  const width = note.width || 260
  const height = note.collapsed ? TITLEBAR_H : note.height || 280
  const hasPos = note.x != null && note.y != null
  const pos = hasPos ? { x: note.x, y: note.y } : activeDisplayPosition(width, height)
  const win = new BrowserWindow({
    width,
    height,
    x: pos.x,
    y: pos.y,
    minWidth: 180,
    minHeight: TITLEBAR_H,
    frame: false,
    transparent: false,
    skipTaskbar: true,
    // A locked note cannot be moved or resized (content lock lives in the renderer).
    resizable: !note.locked,
    movable: !note.locked,
    fullscreenable: false,
    maximizable: false,
    show: false,
    backgroundColor: '#00000000',
    alwaysOnTop: !!note.always_on_top,
    webPreferences: { preload: PRELOAD, sandbox: true, contextIsolation: true }
  })

  win.setOpacity(note.opacity ?? 1.0)
  if (note.always_on_top) win.setAlwaysOnTop(true, 'floating')

  hardenWebContents(win)
  loadPage(win, 'note', { id: String(note.id) })

  win.once('ready-to-show', () => {
    ensureOnScreen(win)
    win.show()
  })
  // `moved` (fires once, after the drag) is macOS/Windows-only. `move` fires on
  // every platform — including Linux — during the drag, so a short quiet period
  // after the last `move` acts as the cross-platform "drag ended" signal. On
  // macOS/Windows both paths run; the second snap is an aligned no-op.
  let moveEndTimer = null
  win.on('move', () => {
    persistBounds(note.id, win) // already debounced internally
    clearTimeout(moveEndTimer)
    moveEndTimer = setTimeout(() => snapWindow(note.id, win), 250)
  })
  win.on('moved', () => {
    snapWindow(note.id, win)
    persistBounds(note.id, win)
  })
  win.on('resize', () => persistBounds(note.id, win))
  win.on('closed', () => {
    clearTimeout(moveEndTimer)
    noteWindows.delete(note.id)
  })
  bindFocusFade(note.id, win)

  noteWindows.set(note.id, win)
  return win
}

/**
 * Opens a note window, focusing it if already open. Trashed notes are refused —
 * they must be restored first, so the trash can never leak editable windows.
 * Opening un-hides an active note; an archived note opens as a "peek" without
 * changing its archived/hidden state, so it does not reappear on the desktop
 * after a restart.
 *
 * @param {number} noteId - Note id.
 * @returns {BrowserWindow|null} The window, or `null` if the note does not
 *   exist or is in the trash.
 */
export function openNote(noteId) {
  const existing = noteWindows.get(noteId)
  if (existing && !existing.isDestroyed()) {
    existing.show()
    existing.focus()
    return existing
  }
  const note = getNote(noteId)
  if (!note || note.deleted_at) return null
  if (note.hidden && !note.archived_at) updateNote(noteId, { hidden: 0 })
  return createNoteWindow(getNote(noteId))
}

/**
 * Returns the live window for a note, or `null` if not open.
 * @param {number} noteId - Note id.
 * @returns {BrowserWindow|null}
 */
export function getNoteWindow(noteId) {
  const w = noteWindows.get(noteId)
  return w && !w.isDestroyed() ? w : null
}

/**
 * Closes a note window without deleting the note (removes it from the desktop).
 * @param {number} noteId - Note id.
 */
export function hideNoteWindow(noteId) {
  const w = getNoteWindow(noteId)
  if (w) w.close()
}

/**
 * Applies native window state that mirrors note fields (opacity, always-on-top,
 * lock, collapse). Content/color are handled inside the renderer.
 *
 * @param {number} noteId - Note id.
 * @param {object} fields - Partial note fields that changed.
 */
export function applyNoteWindowState(noteId, fields) {
  const w = getNoteWindow(noteId)
  if (!w) return
  if ('opacity' in fields) w.setOpacity(fields.opacity)
  if ('always_on_top' in fields) w.setAlwaysOnTop(!!fields.always_on_top, 'floating')
  if ('locked' in fields) {
    w.setMovable(!fields.locked)
    w.setResizable(!fields.locked)
  }
  if ('collapsed' in fields) {
    const note = getNote(noteId)
    if (fields.collapsed) w.setSize(w.getSize()[0], TITLEBAR_H, true)
    else w.setSize(note.width || 260, note.height || 280, true)
  }
}

/**
 * Sends an IPC message to a single note window.
 * @param {number} noteId - Note id.
 * @param {string} channel - IPC channel.
 * @param {*} payload - Message payload.
 */
export function sendToNote(noteId, channel, payload) {
  const w = getNoteWindow(noteId)
  if (w) w.webContents.send(channel, payload)
}

/**
 * Persists the current bounds of every open note window immediately (used on quit,
 * where the debounced persistence may not have flushed yet).
 */
export function flushAllBounds() {
  for (const [id, w] of noteWindows) {
    if (!w || w.isDestroyed()) continue
    const [x, y] = w.getPosition()
    const [width, height] = w.getSize()
    const note = getNote(id)
    if (!note) continue
    if (note.collapsed) updateNote(id, { x, y })
    else updateNote(id, { x, y, width, height })
  }
}

/** Destroys every open note window (used when switching profiles). */
export function closeAllNoteWindows() {
  for (const w of noteWindows.values()) {
    if (w && !w.isDestroyed()) w.destroy()
  }
  noteWindows.clear()
  // Cancel pending debounced writes so no stale bounds land after the switch.
  for (const timer of persistTimers.values()) clearTimeout(timer)
  persistTimers.clear()
}

/** Opens all notes that should be visible on the desktop for the active profile. */
export function restoreVisibleNotes() {
  for (const note of getVisibleNotes()) {
    if (!noteWindows.has(note.id)) createNoteWindow(note)
  }
}

/** Returns the ids of all currently open note windows. @returns {number[]} */
export function getAllNoteWindowIds() {
  return [...noteWindows.keys()]
}

/**
 * Broadcasts an IPC message to every open renderer window (notes, Explorer,
 * options, settings). Used for app-wide events such as a language change.
 * @param {string} channel - IPC channel.
 * @param {*} payload - Message payload.
 */
export function broadcastToAllWindows(channel, payload) {
  const all = [...noteWindows.values(), explorerWindow, optionsWindow, settingsWindow]
  for (const w of all) {
    if (w && !w.isDestroyed()) w.webContents.send(channel, payload)
  }
}

// ---------------------------------------------------------------------------
// Options popup window (independent, frameless)
// ---------------------------------------------------------------------------

/**
 * Opens the note's ⋯ options menu as a standalone window so it can overflow the
 * note's bounds. Positioned under the anchor and clamped to the screen by
 * {@link resizeOptionsWindow} once the content reports its size.
 *
 * @param {number} noteId - Note the menu belongs to.
 * @param {{x?: number, y?: number}} [anchor] - Button position within the note window's client area.
 * @returns {BrowserWindow} The popup window.
 */
export function openOptionsWindow(noteId, anchor = {}) {
  closeOptionsWindow()
  const parent = getNoteWindow(noteId)
  const pb = parent ? parent.getBounds() : { x: 0, y: 0 }

  optionsWindow = new BrowserWindow({
    width: 240,
    height: 320,
    x: Math.round(pb.x + (anchor.x ?? 0)),
    y: Math.round(pb.y + (anchor.y ?? 0)),
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: PRELOAD, sandbox: true, contextIsolation: true }
  })
  optionsWindow.setAlwaysOnTop(true, 'pop-up-menu')
  hardenWebContents(optionsWindow)
  loadPage(optionsWindow, 'options', { id: String(noteId) })
  optionsWindow.once('ready-to-show', () => optionsWindow.show())
  optionsWindow.on('blur', () => closeOptionsWindow())
  optionsWindow.on('closed', () => {
    optionsWindow = null
  })
  return optionsWindow
}

/** Closes the options popup window if open. */
export function closeOptionsWindow() {
  if (optionsWindow && !optionsWindow.isDestroyed()) optionsWindow.destroy()
  optionsWindow = null
}

/**
 * Resizes the options popup to its measured content size, keeping it fully
 * on-screen (shifts it up/left when it would overflow the work area).
 *
 * @param {number} width - Measured content width.
 * @param {number} height - Measured content height.
 */
export function resizeOptionsWindow(width, height) {
  if (!optionsWindow || optionsWindow.isDestroyed()) return
  const w = Math.round(width)
  const h = Math.round(height)
  const [x, y] = optionsWindow.getPosition()
  const area = screen.getDisplayMatching(optionsWindow.getBounds()).workArea
  let nx = x
  let ny = y
  if (nx + w > area.x + area.width - 6) nx = area.x + area.width - w - 6
  if (ny + h > area.y + area.height - 6) ny = area.y + area.height - h - 6
  if (nx < area.x + 6) nx = area.x + 6
  if (ny < area.y + 6) ny = area.y + 6
  optionsWindow.setBounds({ x: Math.round(nx), y: Math.round(ny), width: w, height: h })
}

// ---------------------------------------------------------------------------
// Explorer window
// ---------------------------------------------------------------------------

/** Opens (or focuses) the Explorer window. @returns {BrowserWindow} */
export function openExplorer() {
  if (explorerWindow && !explorerWindow.isDestroyed()) {
    explorerWindow.show()
    explorerWindow.focus()
    return explorerWindow
  }
  explorerWindow = new BrowserWindow({
    width: 384,
    height: 580,
    minWidth: 340,
    minHeight: 360,
    title: t('window.explorer'),
    show: false,
    // frame:false with no titleBarStyle removes all native chrome, including
    // macOS traffic lights (Windows/Linux are already frameless).
    frame: false,
    transparent: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: PRELOAD, sandbox: true, contextIsolation: true }
  })
  hardenWebContents(explorerWindow)
  trackWindowBounds(explorerWindow, 'explorer_bounds')
  loadPage(explorerWindow, 'explorer')
  explorerWindow.once('ready-to-show', () => explorerWindow.show())
  explorerWindow.on('closed', () => {
    explorerWindow = null
  })
  return explorerWindow
}

/** Tells the Explorer window (if open) to reload its data. */
export function refreshExplorer() {
  if (explorerWindow && !explorerWindow.isDestroyed()) {
    explorerWindow.webContents.send('explorer:refresh')
  }
}

// ---------------------------------------------------------------------------
// Settings window
// ---------------------------------------------------------------------------

/** The settings window, or `null` when closed. @type {BrowserWindow|null} */
let settingsWindow = null

/** Opens (or focuses) the settings window. @returns {BrowserWindow} */
export function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show()
    settingsWindow.focus()
    return settingsWindow
  }
  settingsWindow = new BrowserWindow({
    width: 440,
    height: 560,
    minWidth: 380,
    minHeight: 420,
    title: t('window.settings'),
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: PRELOAD, sandbox: true, contextIsolation: true }
  })
  hardenWebContents(settingsWindow)
  trackWindowBounds(settingsWindow, 'settings_bounds')
  loadPage(settingsWindow, 'settings')
  settingsWindow.once('ready-to-show', () => settingsWindow.show())
  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
  return settingsWindow
}
