/**
 * @file Localised labels for a reminder's repeat rule.
 *
 * Turns a stored `repeat_mode` string into human-readable text for the current
 * locale. The parsing itself lives in the shared, pure {@link parseRepeat}.
 */

import { parseRepeat } from '../../../shared/recurrence.js'
import { t, locale } from '../i18n.js'

/**
 * Short weekday names (Sunday-first) for a locale.
 * @param {string} loc - BCP-47 locale.
 * @returns {string[]} Seven short weekday names indexed by `Date.getDay()`.
 */
function weekdayShortNames(loc) {
  // 2024-01-07 is a Sunday, so day 0 aligns with getDay() === 0.
  return Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 7 + i).toLocaleDateString(loc, { weekday: 'short' })
  )
}

/**
 * Describes a repeat mode in the active language, or empty for a one-shot.
 * @param {string} mode - Stored repeat mode.
 * @returns {string} A label such as "Every 3 days" or "Mon, Wed, Fri".
 */
export function repeatLabel(mode) {
  const rule = parseRepeat(mode)
  const loc = locale.value === 'en' ? 'en-US' : 'tr-TR'
  switch (rule.kind) {
    case 'daily':
    case 'weekly':
    case 'monthly':
    case 'yearly':
      return t(`alarm.${rule.kind}`)
    case 'everyDays':
      return t('alarm.everyDaysLabel', { n: rule.n })
    case 'weekdays': {
      const names = weekdayShortNames(loc)
      return rule.days.map((d) => names[d]).join(', ')
    }
    default:
      return ''
  }
}
