/**
 * @file Auto-update (electron-updater).
 *
 * Only runs in a packaged build. The publish provider (e.g. GitHub releases or
 * a generic server) is configured under `publish:` in electron-builder.yml —
 * without it, update checks are skipped silently. Updates download in the
 * background; when one is ready the user is asked whether to restart now. The
 * user can also trigger a check manually (see {@link checkForUpdatesManually}),
 * which surfaces progress as a toast in the open windows.
 */

import electronUpdater from 'electron-updater'
import { dialog } from 'electron'
import log from './logger.js'
import { t } from './i18n.js'
import { broadcastToAllWindows } from './windows.js'

const { autoUpdater } = electronUpdater

/** Re-check for updates on this cadence (ms). */
const CHECK_INTERVAL = 6 * 60 * 60 * 1000

/** True while a *user-initiated* check is in flight, so only those toast. */
let manualCheck = false

/** Guards against showing the restart prompt more than once per session. */
let promptShown = false

/**
 * Broadcasts an update status to renderer windows, but only during a manual
 * check — automatic background checks must not toast on every launch.
 * @param {'checking'|'available'|'none'|'error'} status - Status code.
 */
function broadcastStatus(status) {
  if (manualCheck) broadcastToAllWindows('update:status', status)
}

/**
 * Prompts the user to restart and install a downloaded update. Choosing "later"
 * leaves {@link autoUpdater.autoInstallOnAppQuit} to install it on next quit.
 * @param {{version?: string}} [info] - Update metadata.
 */
async function promptRestart(info) {
  if (promptShown) return
  promptShown = true
  const { response } = await dialog.showMessageBox({
    type: 'info',
    buttons: [t('update.restartNow'), t('update.later')],
    defaultId: 0,
    cancelId: 1,
    title: t('update.downloadedTitle'),
    message: t('update.downloadedTitle'),
    detail: t('update.downloadedMessage', { version: info?.version || '' })
  })
  if (response === 0) autoUpdater.quitAndInstall()
}

/**
 * Initialises the auto-updater, wires event logging/toasts, performs an initial
 * check and schedules periodic checks.
 */
export function initAutoUpdater() {
  autoUpdater.logger = log
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => broadcastStatus('checking'))
  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info?.version)
    broadcastStatus('available')
  })
  autoUpdater.on('update-not-available', () => {
    broadcastStatus('none')
    manualCheck = false
  })
  autoUpdater.on('error', (err) => {
    log.error('Auto-updater error:', err)
    broadcastStatus('error')
    manualCheck = false
  })
  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info?.version)
    manualCheck = false
    promptRestart(info).catch((e) => log.warn('Update restart prompt failed:', e))
  })

  autoUpdater.checkForUpdates().catch((err) => log.warn('Update check failed:', err))
  setInterval(() => {
    autoUpdater.checkForUpdates().catch((err) => log.warn('Update check failed:', err))
  }, CHECK_INTERVAL)
}

/**
 * Runs a user-initiated update check whose progress is reported to the renderer
 * via `update:status` broadcasts.
 */
export function checkForUpdatesManually() {
  manualCheck = true
  autoUpdater.checkForUpdates().catch((err) => {
    log.warn('Manual update check failed:', err)
    manualCheck = false
    broadcastToAllWindows('update:status', 'error')
  })
}
