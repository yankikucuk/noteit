/**
 * @file Alarm scheduler.
 *
 * Polls the database on a fixed interval for due reminders. Reminders of the
 * *active* profile bring their note to the foreground and show a system
 * notification. Reminders of *other* profiles fire as a notification only:
 * clicking it switches to the note's profile and opens the note — unless the
 * profile is password-protected, in which case the notification names the
 * profile but reveals no content (the Explorer opens so the user can unlock).
 * In every case the alarm advances (repeat) or disables (one-shot) exactly as
 * if it had fired normally.
 */

import { Notification, powerMonitor } from 'electron'
import { getDueAlarms, getDueAlarmsOtherProfiles, markAlarmFired, getNote } from './repository.js'
import { openNote, getNoteWindow, sendToNote, openExplorer } from './windows.js'
import { switchToProfile } from './profiles.js'
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

/**
 * Fires a reminder that belongs to a non-active profile as a notification.
 * Password-protected profiles get a content-free notification (no preview —
 * the lock must not leak note text); clicking opens the Explorer to unlock.
 * Unprotected profiles show the preview; clicking switches and opens the note.
 * @param {object} alarm - Alarm row extended with profile fields (see
 *   {@link import('./repository.js').getDueAlarmsOtherProfiles}).
 */
function fireOtherProfileAlarm(alarm) {
  if (Notification.isSupported()) {
    const body = alarm.has_password
      ? t('notify.reminderLocked', { name: alarm.profile_name })
      : `${(alarm.plain_text || t('notify.reminderBody')).slice(0, 80)} — ${alarm.profile_name}`
    const n = new Notification({ title: t('notify.reminderTitle'), body })
    n.on('click', () => {
      if (alarm.has_password) {
        openExplorer() // the user unlocks the profile manually
      } else {
        switchToProfile(alarm.profile_id)
        openNote(alarm.note_id)
      }
    })
    n.show()
  }
  markAlarmFired(alarm.id, computeNextTrigger(alarm.trigger_at, alarm.repeat_mode))
}

/** Checks for and fires all due alarms; errors are logged, not thrown. */
function tick() {
  try {
    const now = Date.now()
    for (const alarm of getDueAlarms(now)) fireAlarm(alarm)
    for (const alarm of getDueAlarmsOtherProfiles(now)) fireOtherProfileAlarm(alarm)
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
