/**
 * @file Custom `noteit://` URL scheme (Electron wiring).
 *
 * Registers the app as the handler for noteit:// links and acts on them:
 *   noteit://note/<id> — open a note (only when it belongs to the active
 *                        profile; links into other, possibly locked, profiles
 *                        are ignored so the scheme cannot bypass a profile lock)
 *   noteit://new       — create a new note
 *   noteit://explorer  — open the Explorer
 *
 * URL parsing lives in the pure `src/shared/deepLink.js`.
 */

import { app } from 'electron'
import { resolve } from 'path'
import { getNote, getCurrentProfileId } from './repository.js'
import { openNote, openExplorer } from './windows.js'
import { newNote } from './tray.js'
import log from './logger.js'
import { PROTOCOL, parseDeepLink } from '../shared/deepLink.js'

export { noteLink, deepLinkFromArgv } from '../shared/deepLink.js'

/** Registers the app as the default client for the noteit:// scheme. */
export function registerProtocolClient() {
  // Under `electron .` in development the executable is Electron itself, so the
  // entry script must be passed along for the OS to relaunch the app correctly.
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [resolve(process.argv[1])])
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL)
  }
}

/**
 * Routes a noteit:// URL to its action. Unknown routes and cross-profile note
 * targets are ignored.
 * @param {string} url - The full noteit:// URL.
 */
export function handleDeepLink(url) {
  const route = parseDeepLink(url)
  if (!route) {
    log.warn('Ignoring unrecognised noteit:// link:', url)
    return
  }
  if (route.action === 'new') {
    newNote()
  } else if (route.action === 'explorer') {
    openExplorer()
  } else if (route.action === 'note') {
    const note = getNote(route.id)
    // Security: never surface a note from another (possibly locked) profile.
    if (note && !note.deleted_at && note.profile_id === getCurrentProfileId()) {
      openNote(route.id)
    } else {
      log.warn('Ignoring noteit:// link to an unavailable note:', url)
    }
  }
}
