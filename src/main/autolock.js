/**
 * @file Idle auto-lock.
 *
 * When `auto_lock_minutes` is set and the active profile is password-protected,
 * the app locks it after that many minutes of no user input by switching to a
 * password-free profile. This closes the protected profile's note windows; the
 * password is required to switch back. Locking is skipped when no password-free
 * profile exists to land on.
 */

import { powerMonitor } from 'electron'
import { getSetting, getProfile, getCurrentProfileId, listProfiles } from './repository.js'
import { switchToProfile } from './profiles.js'
import log from './logger.js'

/** @type {NodeJS.Timeout|null} */
let timer = null

/** How often (ms) to sample the system idle time. */
const POLL_INTERVAL = 30 * 1000

/** Locks the active profile if it is protected and the idle threshold is met. */
function check() {
  try {
    const minutes = Number(getSetting('auto_lock_minutes', 0)) || 0
    if (minutes <= 0) return
    if (powerMonitor.getSystemIdleTime() < minutes * 60) return

    const current = getProfile(getCurrentProfileId())
    if (!current || !current.password_hash) return // nothing to lock

    const fallback = listProfiles().find((p) => !p.has_password && p.id !== current.id)
    if (!fallback) return // no safe profile to land on

    log.info('Auto-locking profile after idle timeout')
    switchToProfile(fallback.id)
  } catch (err) {
    log.error('Auto-lock check failed:', err)
  }
}

/** Starts the idle watcher. */
export function startIdleWatch() {
  stopIdleWatch()
  timer = setInterval(check, POLL_INTERVAL)
}

/** Stops the idle watcher. */
export function stopIdleWatch() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
