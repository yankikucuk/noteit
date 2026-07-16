/**
 * @file HTML sanitisation for imported content.
 *
 * Pure, dependency-free (no DOM) string sanitiser used when foreign HTML enters
 * the database — Markdown-file imports and JSON note imports. It removes the
 * element and attribute classes that could execute script or exfiltrate data.
 *
 * This is one layer of a defence-in-depth stack, not the only one: the renderer
 * CSP (`script-src 'self'`, no `unsafe-inline`) blocks inline handlers even if
 * one slipped through, and the TipTap/ProseMirror schema drops unknown nodes
 * and attributes when the note is opened for editing.
 */

/** Elements whose entire subtree is removed (script-bearing or embedding). */
const DROP_TAGS = 'script|style|iframe|object|embed|form|link|meta|base'

/**
 * URL schemes never allowed in `href`/`src` attributes. `data:` is allowed only
 * for images (`data:image/...`), which pasted/dropped note images rely on.
 */
const BAD_URL = /^\s*(?:javascript:|vbscript:|data:(?!image\/))/i

/**
 * Strips scriptable content from an HTML string: `<script>`-class elements
 * (paired and self-closing), inline `on*` event-handler attributes, and
 * `href`/`src` attributes using dangerous URL schemes.
 *
 * @param {string} html - Untrusted HTML.
 * @returns {string} The sanitised HTML.
 */
export function sanitizeHtml(html) {
  let s = String(html ?? '')

  // Paired dangerous elements, including their content.
  s = s.replace(new RegExp(`<\\s*(${DROP_TAGS})\\b[\\s\\S]*?<\\s*/\\s*\\1\\s*>`, 'gi'), '')
  // Unpaired / self-closing dangerous elements.
  s = s.replace(new RegExp(`<\\s*/?\\s*(?:${DROP_TAGS})\\b[^>]*>`, 'gi'), '')

  // Inline event handlers, in every quoting style.
  s = s.replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
  s = s.replace(/\son\w+\s*=\s*'[^']*'/gi, '')
  s = s.replace(/\son\w+\s*=\s*[^\s>]+/gi, '')

  // href/src attributes with dangerous URL schemes.
  s = s.replace(
    /\s(href|src|xlink:href)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (match, _attr, _q, dq, sq, bare) => (BAD_URL.test(dq ?? sq ?? bare ?? '') ? '' : match)
  )

  return s
}
