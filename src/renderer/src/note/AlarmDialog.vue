<script setup>
/**
 * AlarmDialog — modal to set, change, or clear a note's reminder (date, time,
 * repeat mode). Reads/writes through the alarms API.
 *
 * @prop {number} noteId - Note the alarm belongs to.
 * @emits changed - Boolean: whether the note now has an alarm.
 * @emits close - Request to close the dialog.
 */
import { ref, onMounted } from 'vue'
import { t } from '../i18n.js'
import { useFocusTrap } from '../shared/focusTrap.js'

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
    repeat.value = a.repeat_mode
  } else {
    // Default: one hour from now
    toLocalInputs(Date.now() + 60 * 60 * 1000)
  }
})

async function save() {
  if (!dateStr.value || !timeStr.value) return
  const ts = new Date(`${dateStr.value}T${timeStr.value}`).getTime()
  if (isNaN(ts)) return
  await window.api.alarms.set(props.noteId, ts, repeat.value)
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
          </select>
        </label>
      </div>

      <div class="actions">
        <button v-if="existing" class="ghost" @click="clear">
          <i class="fa-solid fa-trash"></i> {{ t('alarm.remove') }}
        </button>
        <span style="flex: 1"></span>
        <button class="ghost" @click="emit('close')">{{ t('alarm.cancel') }}</button>
        <button class="primary" @click="save">
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
.actions {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
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
