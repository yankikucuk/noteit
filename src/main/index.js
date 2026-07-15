/**
 * @file Application entry point (main process).
 *
 * A tray-resident app: no Dock/taskbar presence, keeps running when all note
 * windows are closed. On startup it applies a CSP, opens the database (with
 * corruption recovery), restores the active profile (never auto-entering a
 * password-protected one), installs IPC/tray/menu, restores visible notes, and
 * starts the alarm scheduler, auto-backup, and (in packaged builds) the updater.
 */

import { app, globalShortcut, session, crashReporter } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs'
import { electronApp, is } from '@electron-toolkit/utils'
import log from './logger.js'
import { initDatabase, closeDatabase, backupTo } from './database.js'
import { registerIpc } from './ipc.js'
import { createTray, newNote } from './tray.js'
import { restoreVisibleNotes, openSettingsWindow, flushAllBounds } from './windows.js'
import { startAlarmScheduler, stopAlarmScheduler } from './alarms.js'
import { startIdleWatch, stopIdleWatch } from './autolock.js'
import { buildApplicationMenu } from './menu.js'
import { initAutoUpdater } from './updater.js'
import { applyGlobalShortcuts } from './shortcuts.js'
import { registerProtocolClient, deepLinkFromArgv, handleDeepLink } from './protocol.js'
import { initLocale, setLocale, t } from './i18n.js'
import {
  getSetting,
  setSetting,
  createNote,
  getVisibleNotes,
  setCurrentProfile,
  listProfiles
} from './repository.js'

// Log otherwise-fatal errors instead of crashing silently.
process.on('uncaughtException', (err) => log.error('Uncaught exception:', err))
process.on('unhandledRejection', (reason) => log.error('Unhandled rejection:', reason))

// Collect native crash minidumps locally (userData/Crashpad). No data leaves
// the machine: uploadToServer is false, so this needs no remote endpoint.
crashReporter.start({ uploadToServer: false })

const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
} else {
  registerProtocolClient()

  // A noteit:// URL clicked while the app is closed arrives on macOS via
  // `open-url` (possibly before the app is ready — buffer it until then).
  let pendingDeepLink = null
  app.on('open-url', (event, url) => {
    event.preventDefault()
    if (app.isReady()) handleDeepLink(url)
    else pendingDeepLink = url
  })

  // A second launch (Windows/Linux) carries any deep link in its argv.
  app.on('second-instance', (_event, argv) => {
    const link = deepLinkFromArgv(argv)
    if (link) handleDeepLink(link)
    else newNote()
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.noteit.app')
    if (process.platform === 'darwin' && app.dock) app.dock.hide()

    applyContentSecurityPolicy()
    initLocale(null) // OS locale first, so the DB seed (default category) matches
    initDatabase()
    const savedLang = getSetting('language', null)
    if (savedLang) setLocale(savedLang)
    activateStartupProfile()
    applyLaunchAtLogin()

    registerIpc()
    createTray()
    buildApplicationMenu(() => openSettingsWindow())

    firstRunWelcome()
    restoreVisibleNotes()
    startAlarmScheduler()
    startIdleWatch()
    startAutoBackup()

    applyGlobalShortcuts()

    if (!is.dev) initAutoUpdater()

    // Handle a deep link that launched the app (macOS buffered it; Windows/Linux
    // pass it in the initial argv).
    const launchLink = pendingDeepLink || deepLinkFromArgv(process.argv)
    if (launchLink) handleDeepLink(launchLink)
  })

  // Keep living in the tray even when every note window is closed.
  app.on('window-all-closed', () => {})

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    stopAlarmScheduler()
    stopIdleWatch()
    flushAllBounds()
    closeDatabase()
  })
}

/**
 * Applies a Content-Security-Policy response header to every renderer request.
 * Development allows the inline/eval/websocket sources Vite's HMR needs;
 * production is locked down to same-origin resources only.
 */
function applyContentSecurityPolicy() {
  const policy = is.dev
    ? "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: ws:"
    : [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self' data:",
        "connect-src 'self'"
      ].join('; ')
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [policy] }
    })
  })
}

/**
 * Activates the startup profile. Security: a password-protected profile is
 * never auto-entered — the app falls back to a password-free profile and the
 * user must unlock the protected one explicitly.
 */
function activateStartupProfile() {
  const profiles = listProfiles()
  const savedId = getSetting('active_profile_id', null)
  const saved = profiles.find((p) => p.id === savedId)
  const active =
    saved && !saved.has_password ? saved : profiles.find((p) => !p.has_password) || profiles[0]
  if (active) {
    setCurrentProfile(active.id)
    setSetting('active_profile_id', active.id)
  }
}

/**
 * Syncs the OS "open at login" setting from the stored preference. Skipped when
 * the preference has never been set, so an unsigned dev build doesn't try (and
 * fail) to register a login item on first run.
 */
function applyLaunchAtLogin() {
  const enabled = getSetting('launch_at_login', null)
  if (enabled === null) return
  try {
    app.setLoginItemSettings({ openAtLogin: !!enabled })
  } catch (err) {
    log.warn('Could not set login item:', err)
  }
}

/**
 * Writes a dated automatic backup on startup and every 24h, keeping the seven
 * most recent copies under userData/backups.
 */
function startAutoBackup() {
  const run = () => {
    try {
      const dir = join(app.getPath('userData'), 'backups')
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      backupTo(join(dir, `auto-${new Date().toISOString().slice(0, 10)}.db`))
      const files = readdirSync(dir)
        .filter((f) => f.startsWith('auto-') && f.endsWith('.db'))
        .sort()
      for (const f of files.slice(0, -7)) {
        try {
          unlinkSync(join(dir, f))
        } catch {
          // ignore
        }
      }
    } catch (err) {
      log.error('Auto-backup failed:', err)
    }
  }
  run()
  setInterval(run, 24 * 60 * 60 * 1000)
}

/** Seeds a friendly welcome note the first time the app runs. */
function firstRunWelcome() {
  if (getSetting('welcomed')) return
  if (getVisibleNotes().length === 0) {
    createNote({ content: t('welcome.html'), plain_text: t('welcome.plain') })
  }
  setSetting('welcomed', true)
}
