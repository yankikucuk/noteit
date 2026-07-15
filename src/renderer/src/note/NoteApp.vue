<script setup>
/**
 * NoteApp — root of a single sticky-note window. Owns the note state, the
 * title bar (new/collapse/options/close), the TipTap editor with debounced
 * autosave, the right-click format menu, the category/tag footer, the snooze
 * bar shown when a reminder fires, and a per-note pomodoro focus timer. Reacts
 * to `note:updated`, `note:open-alarm`, `note:open-history`, `note:alarm-fired`
 * and `note:start-pomodoro` events from the main process.
 *
 * The note id comes from the `?id=` query parameter of the window URL.
 */
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import NoteEditor from './NoteEditor.vue'
import FormatBar from './FormatBar.vue'
import AlarmDialog from './AlarmDialog.vue'
import HistoryDialog from './HistoryDialog.vue'
import IconBtn from '../ui/IconBtn.vue'
import TagChips from '../ui/TagChips.vue'
import TagPicker from '../ui/TagPicker.vue'
import ToastHost from '../ui/ToastHost.vue'
import DialogHost from '../ui/DialogHost.vue'
import { getColor } from '../shared/colors'
import { pushToast } from '../shared/toast.js'
import { t } from '../i18n.js'

const noteId = Number(new URLSearchParams(window.location.search).get('id'))

const note = reactive({
  id: noteId,
  notebook_id: null,
  content: '',
  plain_text: '',
  color: 'yellow',
  opacity: 1,
  always_on_top: 0,
  locked: 0,
  starred: 0,
  collapsed: 0,
  tags: []
})
const loaded = ref(false)
const editorInstance = ref(null)
const editorRef = ref(null)
const alarmOpen = ref(false)
const historyOpen = ref(false)
const hasAlarm = ref(false)
const shaking = ref(false)
const snoozeOpen = ref(false)

// Pomodoro focus timer (renderer-only, ephemeral). 25 min work, 5 min break.
const POMODORO = { work: 25 * 60, break: 5 * 60 }
const pomo = reactive({ active: false, phase: 'work', remaining: 0, paused: false })
let pomoTimer = null
const formatMenu = reactive({ open: false, x: 0, y: 0 })
const tagPickerOpen = ref(false)
const categoryMenuOpen = ref(false)
const notebooks = ref([])

const categoryName = computed(() => {
  const nb = notebooks.value.find((n) => n.id === note.notebook_id)
  return nb ? nb.name : t('category.default')
})

const colorVars = computed(() => {
  const c = getColor(note.color)
  return {
    '--bg': c.bg,
    '--bar': c.bar,
    '--text': c.text,
    '--accent': c.accent
  }
})

const editable = computed(() => !note.locked)

// First line shown in the collapsed title
const firstLine = computed(() => {
  const line = (note.plain_text || '').trim().split('\n')[0]
  return line || t('note.empty')
})

const hasBadges = computed(
  () => note.starred || note.locked || hasAlarm.value || note.always_on_top
)

let unsub = []

onMounted(async () => {
  const data = await window.api.notes.get(noteId)
  if (data) Object.assign(note, data)
  notebooks.value = await window.api.notebooks.list()
  const alarm = await window.api.alarms.get(noteId)
  hasAlarm.value = !!alarm
  loaded.value = true

  // Update from another window (e.g. color/tag/merge from Explorer)
  unsub.push(
    window.api.on('note:updated', (updated) => {
      if (!updated || updated.id !== noteId) return
      const focused = editorInstance.value?.isFocused
      for (const k of [
        'color',
        'opacity',
        'always_on_top',
        'locked',
        'starred',
        'collapsed',
        'notebook_id'
      ]) {
        note[k] = updated[k]
      }
      note.tags = updated.tags || []
      if (!focused && updated.content !== note.content) {
        note.content = updated.content
        editorRef.value?.setContentFromOutside(updated.content)
      }
    })
  )
  unsub.push(
    window.api.on('note:alarm-changed', (alarm) => {
      hasAlarm.value = !!alarm
    })
  )
  unsub.push(
    window.api.on('note:alarm-fired', () => {
      shaking.value = true
      setTimeout(() => (shaking.value = false), 900)
      snoozeOpen.value = true
    })
  )
  // Open the alarm dialog when "Reminder" is chosen in the options window
  unsub.push(
    window.api.on('note:open-alarm', () => {
      alarmOpen.value = true
    })
  )
  // Open the history dialog when "History" is chosen in the options window
  unsub.push(
    window.api.on('note:open-history', () => {
      historyOpen.value = true
    })
  )
  // Start the focus timer when "Focus timer" is chosen in the options window
  unsub.push(window.api.on('note:start-pomodoro', () => startPomodoro()))

  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  unsub.forEach((fn) => fn && fn())
  window.removeEventListener('keydown', onKeydown)
  stopPomodoro()
  flushSave()
})

// --- Autosave (content) ---
let saveTimer = null
function onEditorChange({ html, text }) {
  note.content = html
  note.plain_text = text
  clearTimeout(saveTimer)
  saveTimer = setTimeout(flushSave, 450)
}
function flushSave() {
  clearTimeout(saveTimer)
  window.api.notes.update(noteId, { content: note.content, plain_text: note.plain_text })
}

function onEditorReady(ed) {
  editorInstance.value = ed
}

/** Reloads content from the database (e.g. after restoring a version). */
async function reloadContent() {
  const data = await window.api.notes.get(noteId)
  if (!data) return
  note.content = data.content
  note.plain_text = data.plain_text
  editorRef.value?.setContentFromOutside(data.content)
}

// --- State updates (color/opacity/toggle) ---
function applyUpdate(fields) {
  Object.assign(note, fields)
  window.api.notes.update(noteId, fields)
}

// --- Title bar actions ---
function newNote() {
  window.api.notes.create({ color: note.color })
}
function closeNote() {
  flushSave()
  window.api.window.noteClose(noteId)
}
function toggleCollapse() {
  applyUpdate({ collapsed: note.collapsed ? 0 : 1 })
}

// --- Options menu (separate window; can overflow the note) ---
function openOptions(e) {
  const r = e.currentTarget.getBoundingClientRect()
  // Opens aligned to the button bottom-right; main clamps to screen edges
  window.api.options.open(noteId, { x: Math.round(r.right - 244), y: Math.round(r.bottom + 3) })
}

function focusEditor() {
  if (!alarmOpen.value && editable.value) editorRef.value?.focus()
}

// --- Snooze ---
// Shown after a reminder fires so it can be pushed back without reopening the
// alarm dialog. Presets re-arm the alarm; "tomorrow" targets 9am local time.

/**
 * Re-arms the reminder a fixed number of minutes from now.
 * @param {number} minutes - Delay before it fires again.
 */
async function snooze(minutes) {
  await window.api.alarms.snooze(noteId, Date.now() + minutes * 60 * 1000)
  snoozeOpen.value = false
}

/** Re-arms the reminder for 9am tomorrow (local time). */
async function snoozeTomorrow() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  await window.api.alarms.snooze(noteId, d.getTime())
  snoozeOpen.value = false
}

// --- Pomodoro ---
/** Remaining time as MM:SS. */
const pomoClock = computed(() => {
  const m = Math.floor(pomo.remaining / 60)
  const s = pomo.remaining % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

/** One-second tick: counts down, then alternates work/break and signals the change. */
function tickPomodoro() {
  if (!pomo.active || pomo.paused) return
  if (pomo.remaining > 0) {
    pomo.remaining--
    return
  }
  // Phase finished: alternate work/break and signal the change.
  pomo.phase = pomo.phase === 'work' ? 'break' : 'work'
  pomo.remaining = POMODORO[pomo.phase]
  shaking.value = true
  setTimeout(() => (shaking.value = false), 900)
  pushToast(pomo.phase === 'work' ? t('pomodoro.backToWork') : t('pomodoro.breakTime'), 'info')
}

/** Starts (or restarts) the focus timer at the beginning of a work phase. */
function startPomodoro() {
  pomo.active = true
  pomo.phase = 'work'
  pomo.remaining = POMODORO.work
  pomo.paused = false
  if (!pomoTimer) pomoTimer = setInterval(tickPomodoro, 1000)
}

/** Pauses or resumes the countdown. */
function togglePomodoro() {
  pomo.paused = !pomo.paused
}

/** Stops the timer and clears its interval. */
function stopPomodoro() {
  pomo.active = false
  if (pomoTimer) {
    clearInterval(pomoTimer)
    pomoTimer = null
  }
}

// Right-click on text shows the formatting menu at the cursor
function openFormatMenu(e) {
  if (!editable.value || !editorInstance.value) return
  e.preventDefault()
  // Estimated menu box for edge-clamping (the menu wraps to fit narrow notes).
  const mw = 260
  const mh = 96
  let x = e.clientX
  let y = e.clientY
  if (x + mw > window.innerWidth) x = window.innerWidth - mw - 6
  if (x < 6) x = 6
  if (y + mh > window.innerHeight) y = y - mh - 4
  if (y < 6) y = 6
  formatMenu.x = x
  formatMenu.y = y
  formatMenu.open = true
}

function onGlobalClick() {
  if (formatMenu.open) formatMenu.open = false
  if (tagPickerOpen.value) tagPickerOpen.value = false
  if (categoryMenuOpen.value) categoryMenuOpen.value = false
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    formatMenu.open = false
    tagPickerOpen.value = false
    categoryMenuOpen.value = false
    alarmOpen.value = false
    historyOpen.value = false
  }
}

// --- Tags & category ---
function toggleTagPicker() {
  tagPickerOpen.value = !tagPickerOpen.value
  categoryMenuOpen.value = false
}
function toggleCategoryMenu() {
  categoryMenuOpen.value = !categoryMenuOpen.value
  tagPickerOpen.value = false
}
function setCategory(nbId) {
  categoryMenuOpen.value = false
  note.notebook_id = nbId
  window.api.notes.update(noteId, { notebook_id: nbId })
}
async function removeTag(tagId) {
  await window.api.notes.removeTag(noteId, tagId)
  note.tags = note.tags.filter((t) => t.id !== tagId)
}
function onTagsChanged(tags) {
  note.tags = tags
}
</script>

<template>
  <div
    class="note"
    :class="{ shake: shaking, collapsed: note.collapsed }"
    :style="colorVars"
    @click="onGlobalClick"
  >
    <!-- Title bar (draggable) -->
    <header class="titlebar drag" @dblclick="toggleCollapse">
      <IconBtn icon="fa-solid fa-plus" size="sm" :title="t('note.new')" @click="newNote" />

      <div class="tb-center">
        <span v-if="note.collapsed" class="tb-title">{{ firstLine }}</span>
        <div v-else-if="hasBadges" class="tb-badges">
          <i v-if="note.starred" class="fa-solid fa-star badge star"></i>
          <i v-if="note.always_on_top" class="fa-solid fa-thumbtack badge"></i>
          <i v-if="hasAlarm" class="fa-solid fa-bell badge"></i>
          <i v-if="note.locked" class="fa-solid fa-lock badge"></i>
        </div>
      </div>

      <div class="tb-actions">
        <IconBtn
          :icon="note.collapsed ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-up'"
          size="sm"
          :title="note.collapsed ? t('note.expand') : t('note.collapse')"
          @click="toggleCollapse"
        />
        <IconBtn
          icon="fa-solid fa-ellipsis"
          size="sm"
          :title="t('note.options')"
          @click="openOptions"
        />
        <IconBtn
          icon="fa-solid fa-xmark"
          size="sm"
          danger
          :title="t('note.close')"
          @click="closeNote"
        />
      </div>
    </header>

    <!-- Body -->
    <main v-show="!note.collapsed" class="body" @click="focusEditor" @contextmenu="openFormatMenu">
      <NoteEditor
        v-if="loaded"
        ref="editorRef"
        v-model="note.content"
        :editable="editable"
        @ready="onEditorReady"
        @change="onEditorChange"
      />
    </main>

    <!-- Pomodoro focus timer bar -->
    <div v-if="pomo.active" class="pomobar no-drag fade-in" :class="pomo.phase">
      <i class="fa-solid fa-hourglass-half" aria-hidden="true"></i>
      <span class="p-label">
        {{ pomo.phase === 'work' ? t('pomodoro.focus') : t('pomodoro.break') }}
      </span>
      <span class="p-clock">{{ pomoClock }}</span>
      <button
        :title="pomo.paused ? t('pomodoro.resume') : t('pomodoro.pause')"
        @click="togglePomodoro"
      >
        <i :class="pomo.paused ? 'fa-solid fa-play' : 'fa-solid fa-pause'" aria-hidden="true"></i>
      </button>
      <button class="p-stop" :title="t('pomodoro.stop')" @click="stopPomodoro">
        <i class="fa-solid fa-stop" aria-hidden="true"></i>
      </button>
    </div>

    <!-- Snooze bar, shown after a reminder fires -->
    <div v-if="snoozeOpen" class="snoozebar no-drag fade-in">
      <i class="fa-solid fa-bell" aria-hidden="true"></i>
      <span class="s-label">{{ t('snooze.label') }}</span>
      <button @click="snooze(10)">{{ t('snooze.min10') }}</button>
      <button @click="snooze(60)">{{ t('snooze.hour1') }}</button>
      <button @click="snoozeTomorrow">{{ t('snooze.tomorrow') }}</button>
      <button class="s-dismiss" :title="t('snooze.dismiss')" @click="snoozeOpen = false">
        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>
    </div>

    <!-- Category + tag bar -->
    <footer v-show="!note.collapsed" class="tagbar no-drag">
      <button class="cat-btn" :class="{ on: categoryMenuOpen }" @click.stop="toggleCategoryMenu">
        <i class="fa-solid fa-folder"></i>
        <span>{{ categoryName }}</span>
      </button>

      <div class="tags-scroll">
        <TagChips :tags="note.tags" removable size="sm" @remove="removeTag" />
      </div>

      <IconBtn
        icon="fa-solid fa-tag"
        size="sm"
        :title="t('note.addTag')"
        :active="tagPickerOpen"
        @click="toggleTagPicker"
      />

      <!-- Category picker (opens upward) -->
      <div v-if="categoryMenuOpen" class="cat-menu fade-in" @click.stop>
        <button
          v-for="nb in notebooks"
          :key="nb.id"
          :class="{ on: nb.id === note.notebook_id }"
          @click="setCategory(nb.id)"
        >
          <i class="fa-solid fa-folder"></i>
          <span>{{ nb.name }}</span>
          <i v-if="nb.id === note.notebook_id" class="fa-solid fa-check chk"></i>
        </button>
      </div>

      <!-- Tag picker (opens upward) -->
      <div v-if="tagPickerOpen" class="tag-pop">
        <TagPicker
          :note-id="noteId"
          :model-tags="note.tags"
          @changed="onTagsChanged"
          @close="tagPickerOpen = false"
        />
      </div>
    </footer>

    <!-- Formatting menu shown at the cursor on right-click -->
    <FormatBar
      v-if="formatMenu.open && editable"
      :editor="editorInstance"
      :x="formatMenu.x"
      :y="formatMenu.y"
    />

    <!-- Alarm dialog -->
    <AlarmDialog
      v-if="alarmOpen"
      :note-id="noteId"
      @close="alarmOpen = false"
      @changed="(v) => (hasAlarm = v)"
    />

    <!-- Version history dialog -->
    <HistoryDialog
      v-if="historyOpen"
      :note-id="noteId"
      @close="historyOpen = false"
      @restored="reloadContent"
    />

    <ToastHost />
    <DialogHost />
  </div>
</template>

<style scoped>
.note {
  /* Theme-adaptive hover/active tints so feedback stays visible on dark
     (charcoal) notes as well as light ones. */
  --hover: color-mix(in srgb, var(--text) 12%, transparent);
  --hover-strong: color-mix(in srgb, var(--text) 22%, transparent);
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  color: var(--text);
  position: relative;
  overflow: hidden;
}
.note.collapsed {
  height: 100vh;
}
.titlebar {
  flex: 0 0 auto;
  height: 32px;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 5px;
  color: var(--text);
  background: var(--bar);
}
.tb-center {
  flex: 1 1 auto;
  height: 100%;
  display: flex;
  align-items: center;
  min-width: 0;
  padding: 0 4px;
  overflow: hidden;
}
.tb-badges {
  display: flex;
  align-items: center;
  gap: 9px;
  pointer-events: none;
  opacity: 0.62;
}
.badge {
  font-size: 9.5px;
}
.badge.star {
  color: #e6a800;
  opacity: 1;
}
.tb-title {
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.85;
  pointer-events: none;
}
.tb-actions {
  display: flex;
  align-items: center;
  gap: 1px;
  flex: 0 0 auto;
}
.body {
  flex: 1 1 auto;
  overflow-y: auto;
  overflow-x: hidden;
  font-size: 14px;
  line-height: 1.45;
}

/* Category + tag bar */
.pomobar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  color: var(--text);
  font-size: 11px;
  border-top: 1px solid color-mix(in srgb, var(--text) 12%, transparent);
  background: color-mix(in srgb, var(--accent) 15%, var(--bar));
}
.pomobar.break {
  background: color-mix(in srgb, #2e9e6b 20%, var(--bar));
}
.pomobar > i {
  color: var(--accent);
}
.pomobar.break > i {
  color: #2e9e6b;
}
.pomobar .p-label {
  flex: 1;
  font-weight: 600;
  opacity: 0.85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pomobar .p-clock {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: 12.5px;
}
.pomobar button {
  border: none;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  opacity: 0.7;
  padding: 3px 5px;
  border-radius: var(--r-sm);
}
.pomobar button:hover {
  opacity: 1;
  background: color-mix(in srgb, var(--text) 12%, transparent);
}
.snoozebar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 7px;
  background: color-mix(in srgb, var(--accent) 16%, var(--bar));
  color: var(--text);
  font-size: 11px;
  border-top: 1px solid color-mix(in srgb, var(--text) 12%, transparent);
}
.snoozebar > i {
  color: var(--accent);
}
.snoozebar .s-label {
  flex: 1;
  font-weight: 600;
  opacity: 0.85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.snoozebar button {
  border: 1px solid color-mix(in srgb, var(--text) 18%, transparent);
  background: color-mix(in srgb, var(--text) 6%, transparent);
  color: var(--text);
  font-size: 10.5px;
  font-weight: 600;
  padding: 3px 7px;
  border-radius: var(--r-sm);
  cursor: pointer;
  flex: 0 0 auto;
}
.snoozebar button:hover {
  background: color-mix(in srgb, var(--text) 14%, transparent);
}
.snoozebar .s-dismiss {
  border: none;
  background: transparent;
  opacity: 0.6;
  padding: 3px 5px;
}
.snoozebar .s-dismiss:hover {
  opacity: 1;
  background: transparent;
}
.tagbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 6px;
  min-height: 32px;
  background: var(--bar);
  color: var(--text);
  position: relative;
}
.cat-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 11px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: var(--r-sm);
  cursor: pointer;
  opacity: 0.68;
  flex: 0 0 auto;
  max-width: 42%;
  transition:
    background var(--dur) var(--ease),
    opacity var(--dur) var(--ease);
}
.cat-btn:hover,
.cat-btn.on {
  opacity: 1;
  background: var(--hover);
}
.cat-btn > i {
  font-size: 10px;
}
.cat-btn > span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tags-scroll {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: none;
}
.tags-scroll::-webkit-scrollbar {
  height: 0;
}
.cat-menu {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 6px;
  background: var(--bar);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-pop);
  padding: 5px;
  min-width: 156px;
  max-height: 220px;
  overflow-y: auto;
  z-index: 55;
}
.cat-menu button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: none;
  background: transparent;
  color: var(--text);
  padding: 6px 9px;
  border-radius: var(--r-sm);
  cursor: pointer;
  font-size: 12px;
  text-align: left;
}
.cat-menu button:hover {
  background: var(--hover);
}
.cat-menu button > span {
  flex: 1;
}
.cat-menu button > i:first-child {
  font-size: 11px;
  opacity: 0.7;
}
.cat-menu .chk {
  font-size: 10px;
  opacity: 0.7;
}
.tag-pop {
  position: absolute;
  bottom: calc(100% + 4px);
  right: 6px;
  z-index: 55;
}
@keyframes shake {
  0%,
  100% {
    transform: translateX(0);
  }
  20% {
    transform: translateX(-6px);
  }
  40% {
    transform: translateX(6px);
  }
  60% {
    transform: translateX(-4px);
  }
  80% {
    transform: translateX(4px);
  }
}
.note.shake {
  animation: shake 0.45s ease 2;
}
</style>
