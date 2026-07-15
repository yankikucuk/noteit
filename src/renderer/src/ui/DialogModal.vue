<script setup>
/**
 * DialogModal — the styled prompt/confirm modal driven by the {@link dialogs}
 * store. Mounted only while a dialog is active (so the focus trap engages per
 * open), it is theme-aware (note colors or the Explorer palette) and its width
 * shrinks to fit narrow note windows.
 */
import { ref, onMounted, nextTick } from 'vue'
import { activeDialog, close } from '../shared/dialogs.js'
import { useFocusTrap } from '../shared/focusTrap.js'
import { t } from '../i18n.js'

const dialogEl = ref(null)
const inputEl = ref(null)
const input = ref(activeDialog.value?.value || '')

useFocusTrap(dialogEl)

onMounted(async () => {
  if (activeDialog.value?.kind === 'prompt') {
    await nextTick()
    inputEl.value?.focus()
    inputEl.value?.select?.()
  }
})

/** Confirms the dialog (returns the trimmed input for prompts, true for confirms). */
function onOk() {
  close(activeDialog.value?.kind === 'prompt' ? input.value.trim() : true)
}

/** Cancels the dialog (null for prompts, false for confirms). */
function onCancel() {
  close(activeDialog.value?.kind === 'prompt' ? null : false)
}
</script>

<template>
  <div class="overlay no-drag" @click.self="onCancel" @keydown.esc.prevent="onCancel">
    <div
      ref="dialogEl"
      class="dialog fade-in"
      role="dialog"
      aria-modal="true"
      :aria-label="activeDialog.title || activeDialog.message"
    >
      <div v-if="activeDialog.title" class="title">{{ activeDialog.title }}</div>
      <p v-if="activeDialog.message" class="message">{{ activeDialog.message }}</p>
      <input
        v-if="activeDialog.kind === 'prompt'"
        ref="inputEl"
        v-model="input"
        :type="activeDialog.password ? 'password' : 'text'"
        :placeholder="activeDialog.placeholder || ''"
        @keydown.enter.prevent="onOk"
      />
      <div class="actions">
        <button class="ghost" @click="onCancel">{{ t('common.cancel') }}</button>
        <button class="primary" :class="{ danger: activeDialog.danger }" @click="onOk">
          {{ activeDialog.confirmLabel || t('common.ok') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.32);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 10px;
}
.dialog {
  width: min(320px, calc(100vw - 20px));
  background: var(--bar, var(--x-surface, #fff));
  color: var(--text, var(--x-text, #222));
  border-radius: 12px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.38);
  padding: 14px;
  font-size: 12.5px;
}
.title {
  font-weight: 650;
  font-size: 13.5px;
  margin-bottom: 8px;
}
.message {
  margin: 0 0 12px;
  line-height: 1.5;
  opacity: 0.9;
}
input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid color-mix(in srgb, currentColor 26%, transparent);
  background: color-mix(in srgb, currentColor 8%, transparent);
  color: inherit;
  border-radius: 7px;
  padding: 8px 10px;
  font-size: 12.5px;
  font-family: inherit;
  outline: none;
  margin-bottom: 12px;
}
input:focus {
  border-color: var(--accent, var(--x-accent, #3d7eff));
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.ghost,
.primary {
  border: none;
  cursor: pointer;
  padding: 7px 13px;
  border-radius: 7px;
  font-size: 12.5px;
  font-weight: 600;
  font-family: inherit;
}
.ghost {
  background: color-mix(in srgb, currentColor 10%, transparent);
  color: inherit;
}
.ghost:hover {
  background: color-mix(in srgb, currentColor 16%, transparent);
}
.primary {
  background: var(--accent, var(--x-accent, #3d7eff));
  color: #fff;
}
.primary:hover {
  filter: brightness(1.06);
}
.primary.danger {
  background: #d64545;
}
</style>
