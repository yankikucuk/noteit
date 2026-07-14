/**
 * @file Alarm recurrence math.
 *
 * Pure date arithmetic for advancing a repeating reminder to its next
 * occurrence. Kept dependency-free so it is unit-testable in isolation.
 */

/**
 * Computes the next trigger time for a repeating alarm.
 * @param {number} triggerAt - Current trigger time (epoch ms).
 * @param {string} repeatMode - One of 'once' | 'daily' | 'weekly' | 'monthly' | 'yearly'.
 * @returns {number|null} Next trigger time (epoch ms), or null for a one-shot alarm.
 */
export function computeNextTrigger(triggerAt, repeatMode) {
  const d = new Date(triggerAt)
  switch (repeatMode) {
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
    default:
      return null // 'once'
  }
}
