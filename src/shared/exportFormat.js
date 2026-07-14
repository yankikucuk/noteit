/**
 * @file Note export formatting.
 *
 * Pure conversions used when exporting a note: rich HTML to plain text, and
 * plain text to a minimal RTF document. Dependency-free so they are
 * unit-testable in isolation.
 */

/**
 * Strips HTML to plain text for TXT/RTF export. Block-level tags become line
 * breaks and the common named entities are decoded.
 * @param {string} html - Note HTML content.
 * @returns {string} Plain text.
 */
export function htmlToPlainText(html) {
  return String(html)
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Wraps plain text in a minimal RTF document, escaping the RTF control
 * characters and turning newlines into `\par`.
 * @param {string} text - Plain text.
 * @returns {string} RTF document.
 */
export function plainTextToRtf(text) {
  const escaped = String(text)
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\n/g, '\\par\n')
  return `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Segoe UI;}}\\f0\\fs22 ${escaped}}`
}
