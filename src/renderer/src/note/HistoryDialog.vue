<script setup>
/**
 * HistoryDialog — lists a note's saved content versions (newest first) and lets
 * the user restore any of them. Restoring snapshots the current content first,
 * so the action is itself reversible.
 *
 * @prop {number} noteId - Note whose history is shown.
 * @emits restored - A version was restored (parent should reload content).
 * @emits close - Request to close the dialog.
 */
import { ref, onMounted } from 'vue'
import { t, locale } from '../i18n.js'
import { pushToast } from '../shared/toast.js'
import { useFocusTrap } from '../shared/focusTrap.js'

const props = defineProps({
  noteId: { type: Number, required: true }
})
const emit = defineEmits(['close', 'restored'])

const versions = ref([])
const loaded = ref(false)
const dialogEl = ref(null)
useFocusTrap(dialogEl)

onMounted(async () => {
  versions.value = await window.api.notes.versions(props.noteId)
  loaded.value = true
})

/**
 * Formats a version timestamp for the active locale.
 * @param {number} ts - Epoch milliseconds.
 * @returns {string} Localized date-time string.
 */
function formatDate(ts) {
  return new Date(ts).toLocaleString(locale.value === 'en' ? 'en-US' : 'tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * Returns a short single-line preview of a version's text.
 * @param {{plain_text?: string}} version - Version row.
 * @returns {string} Preview text.
 */
function previewOf(version) {
  const line = (version.plain_text || '').trim().split('\n')[0]
  return line || t('note.empty')
}

async function restore(version) {
  await window.api.notes.restoreVersion(props.noteId, version.id)
  pushToast(t('toast.versionRestored'), 'success')
  emit('restored')
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
      :aria-label="t('history.title')"
    >
      <div class="head">
        <i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i>
        <span>{{ t('history.title') }}</span>
        <button class="x" :aria-label="t('history.close')" @click="emit('close')">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </div>

      <div class="list">
        <div v-if="loaded && versions.length === 0" class="empty">{{ t('history.empty') }}</div>
        <div v-for="version in versions" :key="version.id" class="row">
          <div class="info">
            <span class="date">{{ formatDate(version.created_at) }}</span>
            <span class="preview">{{ previewOf(version) }}</span>
          </div>
          <button class="restore" @click="restore(version)">
            <i class="fa-solid fa-rotate-left" aria-hidden="true"></i> {{ t('history.restore') }}
          </button>
        </div>
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
  width: 250px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
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
  flex: 0 0 auto;
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
.list {
  overflow-y: auto;
  padding: 6px;
}
.empty {
  text-align: center;
  opacity: 0.6;
  padding: 22px 8px;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-radius: 7px;
}
.row:hover {
  background: rgba(0, 0, 0, 0.07);
}
.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.date {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.preview {
  opacity: 0.7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.restore {
  flex: 0 0 auto;
  border: none;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  padding: 5px 9px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 11px;
}
.restore:hover {
  filter: brightness(1.05);
}
</style>
