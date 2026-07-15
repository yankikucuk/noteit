<script setup>
/**
 * ShortcutInput — captures and displays a global-shortcut accelerator. Click to
 * enter capture mode, then press the combination (a modifier is required). Esc
 * cancels. Emits the Electron accelerator string via `update:modelValue`.
 *
 * @prop {string} [modelValue] - The current accelerator (e.g. "CommandOrControl+Alt+N").
 * @emits update:modelValue - The captured accelerator.
 */
import { ref } from 'vue'
import { t } from '../i18n.js'

defineProps({ modelValue: { type: String, default: '' } })
const emit = defineEmits(['update:modelValue'])

const capturing = ref(false)
const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent)

/** Non-printable keys mapped to Electron key names (undefined = unsupported). */
const KEY_MAP = {
  ' ': 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right'
}

/**
 * Builds an Electron accelerator from a keydown event.
 * @param {KeyboardEvent} e - The event.
 * @returns {string|null} The accelerator, or null if incomplete/unsupported.
 */
function toAccelerator(e) {
  if (['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) return null
  const parts = []
  if (e.metaKey || e.ctrlKey) parts.push('CommandOrControl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (!parts.length) return null // a modifier is required
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key in KEY_MAP ? KEY_MAP[e.key] : e.key
  if (!key || key.length > 12) return null
  parts.push(key)
  return parts.join('+')
}

/**
 * Formats an accelerator for display on the current platform.
 * @param {string} accel - Electron accelerator.
 * @returns {string} Human-readable representation.
 */
function display(accel) {
  if (!accel) return ''
  const out = accel
    .replace(/CommandOrControl|CmdOrCtrl/g, isMac ? '⌘' : 'Ctrl')
    .replace(/Alt/g, isMac ? '⌥' : 'Alt')
    .replace(/Shift/g, isMac ? '⇧' : 'Shift')
  return isMac ? out.replace(/\+/g, '') : out
}

function onKeydown(e) {
  e.preventDefault()
  if (e.key === 'Escape') {
    capturing.value = false
    return
  }
  const accel = toAccelerator(e)
  if (accel) {
    emit('update:modelValue', accel)
    capturing.value = false
  }
}
</script>

<template>
  <button
    class="shortcut no-drag"
    :class="{ capturing }"
    type="button"
    @click="capturing = true"
    @blur="capturing = false"
    @keydown="capturing ? onKeydown($event) : null"
  >
    {{ capturing ? t('shortcut.press') : display(modelValue) || t('shortcut.none') }}
  </button>
</template>

<style scoped>
.shortcut {
  min-width: 96px;
  border: 1px solid var(--x-border);
  background: var(--x-surface);
  color: var(--x-text);
  border-radius: var(--r-sm);
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  font-variant-numeric: tabular-nums;
}
.shortcut:hover {
  border-color: var(--x-accent);
}
.shortcut.capturing {
  border-color: var(--x-accent);
  color: var(--x-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--x-accent) 18%, transparent);
}
</style>
