/**
 * @file Search query helpers.
 *
 * Pure transformation of free-form user input into a safe FTS5 MATCH
 * expression. Kept dependency-free so it is unit-testable without a database.
 */

/**
 * Builds a safe FTS5 MATCH expression from free-form user input. Each word
 * becomes a quoted prefix term (`"word"*`), so punctuation never breaks the
 * MATCH syntax and typing a partial word still matches. Letters and digits of
 * any script are kept (Unicode-aware); everything else is treated as a
 * separator.
 * @param {string} query - Raw search term.
 * @returns {string|null} A MATCH expression, or null when there is nothing to match.
 */
export function toFtsQuery(query) {
  const tokens = String(query || '')
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu)
  if (!tokens || !tokens.length) return null
  return tokens.map((tk) => `"${tk}"*`).join(' ')
}
