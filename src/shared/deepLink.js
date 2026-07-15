/**
 * @file Pure parsing for the `noteit://` URL scheme.
 *
 * Dependency-free so it is unit-testable in isolation. The Electron wiring that
 * acts on a parsed link (window/profile side effects) lives in
 * `src/main/protocol.js`.
 */

/** The scheme name (without the `://`). */
export const PROTOCOL = 'noteit'

/**
 * Builds a canonical deep link to a note.
 * @param {number} id - Note id.
 * @returns {string} e.g. `noteit://note/42`.
 */
export function noteLink(id) {
  return `${PROTOCOL}://note/${id}`
}

/**
 * Finds the first noteit:// URL in a list of CLI arguments (Windows/Linux
 * deliver the deep link this way).
 * @param {string[]} argv - Process arguments.
 * @returns {string|null} The deep link, or null.
 */
export function deepLinkFromArgv(argv) {
  return (argv || []).find((a) => typeof a === 'string' && a.startsWith(`${PROTOCOL}://`)) || null
}

/**
 * Parses a noteit:// URL into a route. Unknown routes and malformed note ids
 * return null.
 * @param {string} url - The full noteit:// URL.
 * @returns {{action: 'note'|'new'|'explorer', id?: number}|null}
 */
export function parseDeepLink(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== `${PROTOCOL}:`) return null

  switch (parsed.hostname) {
    case 'new':
      return { action: 'new' }
    case 'explorer':
      return { action: 'explorer' }
    case 'note': {
      const id = Number(parsed.pathname.replace(/^\/+/, ''))
      return Number.isInteger(id) && id > 0 ? { action: 'note', id } : null
    }
    default:
      return null
  }
}
