<script setup>
/**
 * AlarmDialog — modal to set, change, or clear a note's reminder (date, time,
 * repeat mode). Reads/writes through the alarms API.
 *
 * @prop {number} noteId - Note the alarm belongs to.
 * @emits changed - Boolean: whether the note now has an alarm.
 * @emits close - Request to close the dialog.
 */
import { ref, computed, onMounted } from 'vue'
import { t, locale } from '../i18n.js'
import { useFocusTrap } from '../shared/focusTrap.js'
import { parseRepeat } from '../../../shared/recurrence.js'

const props = defineProps({
  noteId: { type: Number, required: true }
})
const emit = defineEmits(['close', 'changed'])

const dialogEl = ref(null)
useFocusTrap(dialogEl)

const dateStr = ref('')
const timeStr = ref('')
const repeat = ref('once')
const existing = ref(null)

// Custom-rule sub-state (only used when repeat === 'custom').
const customKind = ref('everyDays') // 'everyDays' | 'weekdays'
const everyDaysN = ref(2)
const weekdaySel = ref([false, false, false, false, false, false, false])

/** Short weekday names (Sunday-first) for the toggle row, in the active locale. */
const weekdayNames = computed(() => {
  const loc = locale.value === 'en' ? 'en-US' : 'tr-TR'
  return Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 7 + i).toLocaleDateString(loc, { weekday: 'short' })
  )
})

function toLocalInputs(ts) {
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  dateStr.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  timeStr.value = `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

onMounted(async () => {
  const a = await window.api.alarms.get(props.noteId)
  existing.value = a
  if (a) {
    toLocalInputs(a.trigger_at)
    const rule = parseRepeat(a.repeat_mode)
    if (rule.kind === 'everyDays') {
      repeat.value = 'custom'
      customKind.value = 'everyDays'
      everyDaysN.value = rule.n
    } else if (rule.kind === 'weekdays') {
      repeat.value = 'custom'
      customKind.value = 'weekdays'
      rule.days.forEach((d) => (weekdaySel.value[d] = true))
    } else {
      repeat.value = a.repeat_mode
    }
  } else {
    // Default: one hour from now
    toLocalInputs(Date.now() + 60 * 60 * 1000)
  }
})

/** Builds the stored repeat_mode from the current selection (encodes custom rules). */
function resolveRepeatMode() {
  if (repeat.value !== 'custom') return repeat.value
  if (customKind.value === 'everyDays') {
    return `everyDays:${Math.max(1, Math.round(everyDaysN.value) || 1)}`
  }
  const days = weekdaySel.value.map((on, i) => (on ? i : -1)).filter((i) => i >= 0)
  return days.length ? `weekdays:${days.join(',')}` : 'once'
}

/** True when the custom weekday mode is chosen but no day is selected. */
const customIncomplete = computed(
  () =>
    repeat.value === 'custom' && customKind.value === 'weekdays' && !weekdaySel.value.some(Boolean)
)

async function save() {
  if (!dateStr.value || !timeStr.value || customIncomplete.value) return
  const ts = new Date(`${dateStr.value}T${timeStr.value}`).getTime()
  if (isNaN(ts)) return
  await window.api.alarms.set(props.noteId, ts, resolveRepeatMode())
  emit('changed', true)
  emit('close')
}

async function clear() {
  await window.api.alarms.clear(props.noteId)
  emit('changed', false)
  emit('close')
}
</script>

<template>
  <div class="overlay no-drag" @click.self="emit('close')">
    <div
      ref="dialogEl"
      class="dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="t('alarm.title')"
    >
      <div class="head">
        <i class="fa-solid fa-bell" aria-hidden="true"></i>
        <span>{{ t('alarm.title') }}</span>
        <button class="x" :aria-label="t('alarm.cancel')" @click="emit('close')">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </div>

      <div class="fields">
        <label>
          <span>{{ t('alarm.date') }}</span>
          <input type="date" v-model="dateStr" />
        </label>
        <label>
          <span>{{ t('alarm.time') }}</span>
          <input type="time" v-model="timeStr" />
        </label>
        <label>
          <span>{{ t('alarm.repeat') }}</span>
          <select v-model="repeat">
            <option value="once">{{ t('alarm.once') }}</option>
            <option value="daily">{{ t('alarm.daily') }}</option>
            <option value="weekly">{{ t('alarm.weekly') }}</option>
            <option value="monthly">{{ t('alarm.monthly') }}</option>
            <option value="yearly">{{ t('alarm.yearly') }}</option>
            <option value="custom">{{ t('alarm.custom') }}</option>
          </select>
        </label>

        <template v-if="repeat === 'custom'">
          <div class="seg">
            <button
              type="button"
              :class="{ on: customKind === 'everyDays' }"
              @click="customKind = 'everyDays'"
            >
              {{ t('alarm.everyDays') }}
            </button>
            <button
              type="button"
              :class="{ on: customKind === 'weekdays' }"
              @click="customKind = 'weekdays'"
            >
              {{ t('alarm.onDays') }}
            </button>
          </div>

          <label v-if="customKind === 'everyDays'">
            <span>{{ t('alarm.everyNDays') }}</span>
            <input v-model.number="everyDaysN" type="number" min="1" max="365" class="num" />
          </label>

          <div v-else class="weekdays">
            <button
              v-for="(name, i) in weekdayNames"
              :key="i"
              type="button"
              class="wd"
              :class="{ on: weekdaySel[i] }"
              @click="weekdaySel[i] = !weekdaySel[i]"
            >
              {{ name }}
            </button>
          </div>
        </template>
      </div>

      <div class="actions">
        <button v-if="existing" class="ghost" @click="clear">
          <i class="fa-solid fa-trash"></i> {{ t('alarm.remove') }}
        </button>
        <span style="flex: 1"></span>
        <button class="ghost" @click="emit('close')">{{ t('alarm.cancel') }}</button>
        <button class="primary" :disabled="customIncomplete" @click="save">
          <i class="fa-solid fa-check"></i> {{ t('alarm.save') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.28);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.dialog {
  width: min(232px, calc(100vw - 20px));
  background: var(--bar);
  color: var(--text);
  border-radius: 12px;
  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.35);
  overflow: hidden;
  font-size: 12.5px;
}
.head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  font-weight: 600;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}
.head > span {
  flex: 1;
}
.x {
  border: none;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  opacity: 0.6;
}
.x:hover {
  opacity: 1;
}
.fields {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
label > span {
  opacity: 0.8;
}
input,
select {
  border: 1px solid color-mix(in srgb, currentColor 24%, transparent);
  border-radius: 6px;
  padding: 4px 7px;
  background: color-mix(in srgb, currentColor 8%, transparent);
  color: inherit;
  font-size: 12px;
  font-family: inherit;
}
.num {
  width: 64px;
}
.seg {
  display: flex;
  gap: 4px;
}
.seg button {
  flex: 1;
  border: 1px solid color-mix(in srgb, currentColor 24%, transparent);
  background: color-mix(in srgb, currentColor 6%, transparent);
  color: inherit;
  border-radius: 6px;
  padding: 4px 6px;
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
}
.seg button.on {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.weekdays {
  display: flex;
  gap: 3px;
  justify-content: space-between;
}
.wd {
  flex: 1;
  border: 1px solid color-mix(in srgb, currentColor 24%, transparent);
  background: color-mix(in srgb, currentColor 6%, transparent);
  color: inherit;
  border-radius: 6px;
  padding: 4px 0;
  font-size: 10px;
  font-family: inherit;
  cursor: pointer;
}
.wd.on {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.actions {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
}
.primary:disabled {
  opacity: 0.45;
  cursor: default;
}
.ghost {
  border: none;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  padding: 5px 9px;
  border-radius: 6px;
  font-size: 12px;
}
.ghost:hover {
  background: rgba(0, 0, 0, 0.1);
}
.primary {
  border: none;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  padding: 5px 11px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 12px;
}
.primary:hover {
  filter: brightness(1.05);
}
</style>
