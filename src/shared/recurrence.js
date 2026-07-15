/**
 * @file Alarm recurrence math.
 *
 * Pure date arithmetic for advancing a repeating reminder to its next
 * occurrence. Kept dependency-free so it is unit-testable in isolation.
 *
 * A reminder's `repeat_mode` is a string. Besides the fixed presets
 * ('once' | 'daily' | 'weekly' | 'monthly' | 'yearly') it may encode a custom
 * rule: `everyDays:N` (every N days) or `weekdays:d1,d2,…` (specific weekdays,
 * 0 = Sunday). Encoding the rule in the existing column avoids a schema change.
 */

/**
 * Parses a `repeat_mode` string into a structured descriptor.
 * @param {string} mode - The stored repeat mode.
 * @returns {{kind: string, n?: number, days?: number[]}} Descriptor; kind is
 *   'daily'|'weekly'|'monthly'|'yearly'|'everyDays'|'weekdays'|'once'.
 */
export function parseRepeat(mode) {
  if (mode === 'daily' || mode === 'weekly' || mode === 'monthly' || mode === 'yearly') {
    return { kind: mode }
  }
  const every = /^everyDays:(\d+)$/.exec(mode || '')
  if (every) {
    const n = Number(every[1])
    if (n >= 1) return { kind: 'everyDays', n }
  }
  const weekly = /^weekdays:([0-6](?:,[0-6])*)$/.exec(mode || '')
  if (weekly) {
    const days = [...new Set(weekly[1].split(',').map(Number))].sort((a, b) => a - b)
    if (days.length) return { kind: 'weekdays', days }
  }
  return { kind: 'once' }
}

/**
 * Computes the next trigger time for a repeating alarm.
 * @param {number} triggerAt - Current trigger time (epoch ms).
 * @param {string} repeatMode - A preset or custom rule (see file docblock).
 * @returns {number|null} Next trigger time (epoch ms), or null for a one-shot alarm.
 */
export function computeNextTrigger(triggerAt, repeatMode) {
  const d = new Date(triggerAt)
  const rule = parseRepeat(repeatMode)
  switch (rule.kind) {
    case 'daily':
      d.setDate(d.getDate() + 1)
      return d.getTime()
    case 'weekly':
      d.setDate(d.getDate() + 7)
      return d.getTime()
    case 'monthly':
      d.setMonth(d.getMonth() + 1)
      return d.getTime()
    case 'yearly':
      d.setFullYear(d.getFullYear() + 1)
      return d.getTime()
    case 'everyDays':
      d.setDate(d.getDate() + rule.n)
      return d.getTime()
    case 'weekdays': {
      // Step forward day by day (at most a week) to the next selected weekday.
      const set = new Set(rule.days)
      for (let i = 0; i < 7; i++) {
        d.setDate(d.getDate() + 1)
        if (set.has(d.getDay())) return d.getTime()
      }
      return null
    }
    default:
      return null // 'once'
  }
}
