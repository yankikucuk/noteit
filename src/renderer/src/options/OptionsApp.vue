<script setup>
/**
 * OptionsApp — root of the standalone options popup window. Loads the note by
 * `?id=`, renders OptionsMenu with the note's color theme, reports its measured
 * size back to the main process for window sizing, and routes menu actions
 * (color/opacity/toggles persist immediately; alarm is delegated to the note
 * window; duplicate/explorer/trash close the popup).
 */
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import OptionsMenu from '../note/OptionsMenu.vue'
import ToastHost from '../ui/ToastHost.vue'
import { getColor } from '../shared/colors'
import { pushToast } from '../shared/toast.js'
import { t } from '../i18n.js'

const noteId = Number(new URLSearchParams(window.location.search).get('id'))
const note = reactive({
  id: noteId,
  color: 'yellow',
  opacity: 1,
  always_on_top: 0,
  locked: 0,
  starred: 0
})
const hasAlarm = ref(false)
const loaded = ref(false)
const wrapEl = ref(null)
let unsub = null

const colorVars = computed(() => {
  const c = getColor(note.color)
  return { '--bg': c.bg, '--bar': c.bar, '--text': c.text, '--accent': c.accent }
})

onMounted(async () => {
  const data = await window.api.notes.get(noteId)
  if (data) Object.assign(note, data)
  const alarm = await window.api.alarms.get(noteId)
  hasAlarm.value = !!alarm
  loaded.value = true
  await nextTick()
  measure()
  window.addEventListener('keydown', onKeydown)
  unsub = window.api.on('note:updated', (u) => {
    if (u && u.id === noteId) {
      for (const k of ['color', 'opacity', 'always_on_top', 'locked', 'starred']) note[k] = u[k]
    }
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  if (unsub) unsub()
})

// Re-measure when the content height might change (rare)
watch(loaded, () => nextTick(measure))

function measure() {
  const el = wrapEl.value
  if (!el) return
  const r = el.getBoundingClientRect()
  window.api.options.resize(Math.ceil(r.width), Math.ceil(r.height))
}

function onKeydown(e) {
  if (e.key === 'Escape') window.api.options.close()
}

function close() {
  window.api.options.close()
}

function applyUpdate(fields) {
  Object.assign(note, fields)
  window.api.notes.update(noteId, fields)
}

function onAction(action) {
  if (action === 'alarm' || action === 'history') {
    window.api.options.action(action, noteId)
  } else if (action === 'duplicate') {
    window.api.notes.duplicate(noteId)
    window.api.options.close()
  } else if (action === 'explorer') {
    window.api.explorer.open()
    window.api.options.close()
  } else if (action === 'trash') {
    window.api.notes.trash(noteId)
    window.api.options.close()
  } else if (action === 'copy-md') {
    window.api.notes.copyMarkdown(noteId).then((r) => {
      if (r?.ok) pushToast(t('toast.copied'), 'success')
    })
  } else if (action === 'copy-link') {
    window.api.notes.copyLink(noteId).then((r) => {
      if (r?.ok) pushToast(t('toast.linkCopied'), 'success')
    })
  } else if (action === 'png') {
    window.api.notes.exportPng(noteId)
  } else if (action === 'print') {
    window.api.notes.print(noteId)
  } else if (action === 'export:pdf') {
    window.api.notes.exportPdf(noteId)
  } else if (action.startsWith('export:')) {
    window.api.notes.export(noteId, action.split(':')[1])
  }
}
</script>

<template>
  <div ref="wrapEl" class="wrap" :style="colorVars">
    <OptionsMenu
      v-if="loaded"
      :note="note"
      :has-alarm="hasAlarm"
      @update="applyUpdate"
      @action="onAction"
      @close="close"
    />
    <ToastHost />
  </div>
</template>

<style scoped>
.wrap {
  /* Theme-adaptive hover tints (visible on dark notes too). */
  --hover: color-mix(in srgb, var(--text) 12%, transparent);
  --hover-strong: color-mix(in srgb, var(--text) 22%, transparent);
  display: inline-block;
  padding: 10px;
}
</style>
