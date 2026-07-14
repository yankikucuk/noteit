/**
 * @file Alarm scheduler.
 *
 * Polls the database on a fixed interval for due reminders, brings the
 * associated note to the foreground, shows a system notification, and advances
 * repeating alarms. Only alarms of the active profile fire (see
 * {@link import('./repository.js').getDueAlarms}).
 */

import { Notification, powerMonitor } from 'electron'
import { getDueAlarms, markAlarmFired, getNote } from './repository.js'
import { openNote, getNoteWindow, sendToNote } from './windows.js'
import { t } from './i18n.js'
import log from './logger.js'
import { computeNextTrigger } from '../shared/recurrence.js'

/** @type {NodeJS.Timeout|null} */
let timer = null

/** Whether the power-resume listener has been attached. */
let resumeBound = false

/** How often (ms) to check for due alarms. */
const POLL_INTERVAL = 20 * 1000

/**
 * Fires a single alarm: focuses the note, shows a notification, and schedules
 * (or disables) the next occurrence.
 * @param {object} alarm - Alarm row.
 */
function fireAlarm(alarm) {
  const note = getNote(alarm.note_id)
  if (!note) {
    markAlarmFired(alarm.id, null)
    return
  }

  const win = getNoteWindow(note.id) || openNote(note.id)
  if (win) {
    win.show()
    win.focus()
    sendToNote(note.id, 'note:alarm-fired', { noteId: note.id }) // brief shake/highlight
  }

  if (Notification.isSupported()) {
    const preview = (note.plain_text || t('notify.reminderBody')).slice(0, 80)
    const n = new Notification({ title: t('notify.reminderTitle'), body: preview })
    n.on('click', () => {
      const w = getNoteWindow(note.id) || openNote(note.id)
      if (w) w.focus()
    })
    n.show()
  }

  markAlarmFired(alarm.id, computeNextTrigger(alarm.trigger_at, alarm.repeat_mode))
}

/** Checks for and fires all due alarms; errors are logged, not thrown. */
function tick() {
  try {
    for (const alarm of getDueAlarms(Date.now())) fireAlarm(alarm)
  } catch (err) {
    log.error('Alarm check failed:', err)
  }
}

/** Starts the scheduler, immediately catching up on any missed alarms. */
export function startAlarmScheduler() {
  stopAlarmScheduler()
  tick()
  timer = setInterval(tick, POLL_INTERVAL)
  // The interval does not fire while the machine is asleep, so re-check as soon
  // as it wakes to surface any reminders that came due in the meantime.
  if (!resumeBound) {
    powerMonitor.on('resume', tick)
    resumeBound = true
  }
}

/** Stops the scheduler. */
export function stopAlarmScheduler() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
