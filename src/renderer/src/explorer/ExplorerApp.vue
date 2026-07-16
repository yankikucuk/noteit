<script setup>
/**
 * ExplorerApp — root of the Explorer window. Lists the active profile's notes,
 * archive and trash with debounced search, sorting, and category/tag filters
 * that can be stored as reusable presets (saved filters). Also hosts the
 * command palette (Cmd/Ctrl+K), an agenda of upcoming reminders, the profile
 * switcher (ProfileMenu), multi-select bulk actions, bulk lock, and
 * backup/restore. Re-fetches on the `explorer:refresh` event (also fired on
 * profile switch).
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { getColor, getTagColor } from '../shared/colors'
import IconBtn from '../ui/IconBtn.vue'
import TagChips from '../ui/TagChips.vue'
import ToastHost from '../ui/ToastHost.vue'
import DialogHost from '../ui/DialogHost.vue'
import ProfileMenu from './ProfileMenu.vue'
import CommandPalette from './CommandPalette.vue'
import { pushToast } from '../shared/toast.js'
import { promptDialog, confirmDialog } from '../shared/dialogs.js'
import { repeatLabel } from '../shared/repeatLabel.js'
import { debounce } from '../shared/debounce.js'
import { t, locale } from '../i18n.js'

const view = ref('notes') // 'notes' | 'trash'
const notebookFilter = ref('all')
const tagFilter = ref(null)
const query = ref('')
const sortBy = ref('updated')
const sortDir = ref('desc')
const notes = ref([])
const notebooks = ref([])
const allTags = ref([])
const selected = ref(new Set())
const currentProfile = ref(null)
const profileMenuOpen = ref(false)
const savedFilters = ref([])
const agendaOpen = ref(false)
const upcoming = ref([])

// Incremental rendering: only the first `renderLimit` cards are in the DOM;
// scrolling near the end reveals more. This keeps large lists responsive
// without a fixed-height virtual scroller (note cards vary in height).
const RENDER_STEP = 60
const renderLimit = ref(RENDER_STEP)
const listEl = ref(null)

let unsub = null

onMounted(async () => {
  await loadProfile()
  await loadNotebooks()
  await loadTags()
  await loadFilters()
  await refresh()
  unsub = window.api.on('explorer:refresh', () => {
    // Profile switch also fires this; reset profile filters
    notebookFilter.value = 'all'
    tagFilter.value = null
    loadProfile()
    loadFilters()
    refresh()
  })
})
onBeforeUnmount(() => unsub && unsub())

async function loadProfile() {
  currentProfile.value = await window.api.profiles.current()
}
async function loadNotebooks() {
  notebooks.value = await window.api.notebooks.list()
}
async function loadTags() {
  allTags.value = await window.api.tags.list()
}
async function loadFilters() {
  savedFilters.value = await window.api.filters.list()
}
async function loadAgenda() {
  upcoming.value = await window.api.alarms.upcoming()
}
function onProfileSwitched() {
  notebookFilter.value = 'all'
  tagFilter.value = null
  loadProfile()
  loadFilters()
  refresh()
}

async function refresh() {
  if (view.value === 'trash') {
    notes.value = await window.api.notes.listTrashed()
  } else if (view.value === 'archive') {
    notes.value = await window.api.notes.listArchived()
  } else if (query.value.trim()) {
    notes.value = await window.api.notes.search(query.value.trim())
  } else {
    notes.value = await window.api.notes.listActive()
  }
  // Independent side lists load in parallel — they don't depend on the notes.
  await Promise.all([loadNotebooks(), loadTags(), loadAgenda()])
  selected.value = new Set([...selected.value].filter((id) => notes.value.some((n) => n.id === id)))
}

// Search-as-you-type collapses keystrokes into a single query instead of one
// IPC round-trip per character.
const onSearchInput = debounce(refresh, 200)

/** Clears the search box and refreshes immediately, dropping any pending search. */
function clearSearch() {
  onSearchInput.cancel()
  query.value = ''
  refresh()
}

const visibleNotes = computed(() => {
  let list = [...notes.value]
  if (view.value === 'notes' && notebookFilter.value !== 'all') {
    list = list.filter((n) => n.notebook_id === notebookFilter.value)
  }
  if (view.value === 'notes' && tagFilter.value) {
    list = list.filter((n) => (n.tags || []).some((t) => t.id === tagFilter.value))
  }
  const dir = sortDir.value === 'asc' ? 1 : -1
  list.sort((a, b) => {
    let r = 0
    if (sortBy.value === 'updated') r = a.updated_at - b.updated_at
    else if (sortBy.value === 'created') r = a.created_at - b.created_at
    else if (sortBy.value === 'text')
      r = (a.plain_text || '').localeCompare(b.plain_text || '', locale.value)
    else if (sortBy.value === 'starred') r = a.starred - b.starred
    return r * dir
  })
  return list
})

/** The slice of {@link visibleNotes} currently rendered into the DOM. */
const renderedNotes = computed(() => visibleNotes.value.slice(0, renderLimit.value))

/**
 * Reveals another page of cards when the list is scrolled near its end.
 * @param {Event} e - Scroll event from the list container.
 */
function onListScroll(e) {
  const el = e.target
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
    if (renderLimit.value < visibleNotes.value.length) renderLimit.value += RENDER_STEP
  }
}

// Any change that reshapes the list resets paging and scroll position.
watch([view, notebookFilter, tagFilter, query, sortBy, sortDir], () => {
  renderLimit.value = RENDER_STEP
  if (listEl.value) listEl.value.scrollTop = 0
})

const allLocked = computed(() => {
  const active = notes.value.filter((n) => !n.deleted_at)
  return active.length > 0 && active.every((n) => n.locked)
})
async function toggleLockAll() {
  await window.api.notes.lockAll(allLocked.value ? 0 : 1)
  refresh()
}

function switchView(v) {
  view.value = v
  query.value = ''
  tagFilter.value = null
  selected.value = new Set()
  refresh()
}
function toggleTagFilter(id) {
  tagFilter.value = tagFilter.value === id ? null : id
}

// --- Saved filters ---
// A preset captures the category, tag and sort of the current Notes view so a
// frequent combination can be recalled with one click. Ids are validated on
// apply because a category or tag the preset points at may have been deleted.

/** Id of the saved filter matching the current view, or null. Drives the active pill highlight. */
const activeFilterId = computed(() => {
  const f = savedFilters.value.find(
    (s) =>
      s.notebook === notebookFilter.value &&
      (s.tag ?? null) === tagFilter.value &&
      s.sortBy === sortBy.value &&
      s.sortDir === sortDir.value
  )
  return f ? f.id : null
})

/** True when the current view differs from the default and isn't already a saved preset. */
const canSaveFilter = computed(
  () =>
    activeFilterId.value === null &&
    (notebookFilter.value !== 'all' ||
      tagFilter.value !== null ||
      sortBy.value !== 'updated' ||
      sortDir.value !== 'desc')
)

/** Persists the saved-filter list to the current profile. */
async function persistFilters() {
  await window.api.filters.save(savedFilters.value)
}

/** Prompts for a name and stores the current category/tag/sort as a preset. */
async function saveCurrentFilter() {
  const name = (await promptDialog({ title: t('filter.savePrompt') }))?.trim()
  if (!name) return
  savedFilters.value = [
    ...savedFilters.value,
    {
      id: Date.now(),
      name,
      notebook: notebookFilter.value,
      tag: tagFilter.value,
      sortBy: sortBy.value,
      sortDir: sortDir.value
    }
  ]
  await persistFilters()
  pushToast(t('filter.saved'), 'success')
}

/** Applies a preset, ignoring a category or tag that no longer exists. */
function applyFilter(f) {
  notebookFilter.value =
    f.notebook === 'all' || notebooks.value.some((n) => n.id === f.notebook) ? f.notebook : 'all'
  tagFilter.value = f.tag && allTags.value.some((tg) => tg.id === f.tag) ? f.tag : null
  sortBy.value = f.sortBy
  sortDir.value = f.sortDir
}

/** Removes a preset after confirmation (right-click on a preset pill). */
async function deleteFilter(f) {
  const ok = await confirmDialog({
    title: t('filter.deleteTitle'),
    message: t('filter.deleteConfirm', { name: f.name }),
    danger: true
  })
  if (!ok) return
  savedFilters.value = savedFilters.value.filter((s) => s.id !== f.id)
  await persistFilters()
}

// --- Agenda ---
// A dropdown listing the profile's upcoming reminders, soonest first.

function toggleAgenda() {
  agendaOpen.value = !agendaOpen.value
  if (agendaOpen.value) loadAgenda()
}
function openAgendaNote(row) {
  agendaOpen.value = false
  window.api.notes.open(row.note_id)
}

/** First line of a reminder's note, for the agenda label. */
function agendaTitle(row) {
  return (row.plain_text || '').trim().split('\n')[0] || t('note.empty')
}

/** Human-friendly "when" for a reminder: overdue, today/tomorrow + time, else a date. */
function agendaWhen(ts) {
  const loc = locale.value === 'en' ? 'en-US' : 'tr-TR'
  const d = new Date(ts)
  const time = d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })
  if (ts < Date.now()) return t('agenda.overdue')
  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(today.getDate() + 1)
  if (d.toDateString() === today.toDateString()) return `${t('agenda.today')} ${time}`
  if (d.toDateString() === tomorrow.toDateString()) return `${t('agenda.tomorrow')} ${time}`
  return `${d.toLocaleDateString(loc, { day: '2-digit', month: 'short' })} ${time}`
}

function titleOf(n) {
  const line = (n.plain_text || '').trim().split('\n')[0]
  return line || t('note.empty')
}
function previewOf(n) {
  const lines = (n.plain_text || '').trim().split('\n')
  return lines.slice(1).join(' ').slice(0, 90)
}
function dateOf(n) {
  const ts = view.value === 'trash' ? n.deleted_at : n.updated_at
  const d = new Date(ts)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const loc = locale.value === 'en' ? 'en-US' : 'tr-TR'
  return sameDay
    ? d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(loc, { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// --- Actions ---
function openNote(n) {
  window.api.notes.open(n.id)
}
async function toggleStar(n) {
  await window.api.notes.update(n.id, { starred: n.starred ? 0 : 1 })
  refresh()
}
async function trash(n) {
  await window.api.notes.trash(n.id)
  refresh()
}
async function restore(n) {
  await window.api.notes.restore(n.id)
  refresh()
}
async function archive(n) {
  await window.api.notes.archive(n.id)
  refresh()
}
async function unarchive(n) {
  await window.api.notes.unarchive(n.id)
  refresh()
}
async function deleteForever(n) {
  const ok = await confirmDialog({
    message: t('explorer.deleteNoteConfirm'),
    confirmLabel: t('common.delete'),
    danger: true
  })
  if (ok) {
    await window.api.notes.deleteForever(n.id)
    refresh()
  }
}
async function emptyTrash() {
  const ok = await confirmDialog({
    message: t('explorer.emptyTrashConfirm'),
    confirmLabel: t('common.delete'),
    danger: true
  })
  if (ok) {
    await window.api.trash.empty()
    refresh()
  }
}
function newNote() {
  window.api.notes.create({
    notebook_id: notebookFilter.value !== 'all' ? notebookFilter.value : undefined
  })
}

// Selection (multi, for merge)
function toggleSelect(n, e) {
  // Trashed notes are never opened directly — restore first (the main process
  // refuses them too); a plain click in the trash view is a no-op.
  if (!e.ctrlKey && !e.metaKey) {
    if (view.value !== 'trash') openNote(n)
    return
  }
  const s = new Set(selected.value)
  s.has(n.id) ? s.delete(n.id) : s.add(n.id)
  selected.value = s
}
async function mergeSelected() {
  if (selected.value.size < 2) return
  await window.api.notes.merge([...selected.value])
  selected.value = new Set()
  refresh()
}

/** Applies a bulk action to the current multi-selection. */
async function bulk(action, value) {
  if (!selected.value.size) return
  await window.api.notes.bulk([...selected.value], action, value)
  if (action === 'trash' || action === 'archive') selected.value = new Set()
  refresh()
}
async function bulkTrash() {
  const ok = await confirmDialog({
    message: t('explorer.bulkTrashConfirm', { count: selected.value.size }),
    confirmLabel: t('common.delete'),
    danger: true
  })
  if (ok) bulk('trash')
}

// Notebooks (categories)
async function addNotebook() {
  const name = await promptDialog({
    title: t('category.newPrompt'),
    confirmLabel: t('common.ok')
  })
  if (name) {
    await window.api.notebooks.create(name)
    loadNotebooks()
  }
}
async function renameNotebook(nb) {
  const name = await promptDialog({ title: t('category.renamePrompt'), value: nb.name })
  if (name) {
    await window.api.notebooks.rename(nb.id, name)
    loadNotebooks()
  }
}
async function removeNotebook(nb) {
  const ok = await confirmDialog({
    message: t('category.deleteConfirm', { name: nb.name }),
    confirmLabel: t('common.delete'),
    danger: true
  })
  if (ok) {
    await window.api.notebooks.remove(nb.id)
    if (notebookFilter.value === nb.id) notebookFilter.value = 'all'
    loadNotebooks()
  }
}

// Delete a tag entirely from the profile (right-click on a tag filter pill).
async function removeTag(tag) {
  const ok = await confirmDialog({
    message: t('tag.deleteConfirm', { name: tag.name }),
    confirmLabel: t('common.delete'),
    danger: true
  })
  if (ok) {
    await window.api.tags.remove(tag.id)
    if (tagFilter.value === tag.id) tagFilter.value = null
    loadTags()
    refresh()
  }
}

// Backup
async function backup() {
  const r = await window.api.backup.create()
  if (r.ok) pushToast(t('toast.backupCreated'), 'success')
}
async function restoreBackup() {
  await window.api.backup.restore()
}

function toggleSortDir() {
  sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
}
function closeWindow() {
  window.api.window.close()
}
</script>

<template>
  <div class="explorer">
    <!-- Top bar -->
    <header class="topbar drag">
      <button
        class="profile-btn no-drag"
        :class="{ on: profileMenuOpen }"
        :title="t('explorer.switchProfile')"
        @click.stop="profileMenuOpen = !profileMenuOpen"
      >
        <i class="fa-solid fa-note-sticky brand-i"></i>
        <span class="pn">{{ currentProfile ? currentProfile.name : 'NoteIt' }}</span>
        <i v-if="currentProfile && currentProfile.has_password" class="fa-solid fa-lock lk"></i>
        <i class="fa-solid fa-chevron-down chev"></i>
      </button>
      <IconBtn icon="fa-solid fa-plus" :title="t('explorer.newNote')" @click="newNote" />
      <button
        class="agenda-btn no-drag"
        :class="{ on: agendaOpen }"
        :title="t('agenda.title')"
        @click.stop="toggleAgenda"
      >
        <i class="fa-solid fa-bell"></i>
        <span v-if="upcoming.length" class="agenda-count">{{ upcoming.length }}</span>
      </button>
      <IconBtn icon="fa-solid fa-xmark" :title="t('explorer.close')" @click="closeWindow" />

      <div v-if="profileMenuOpen" class="pm-overlay" @click="profileMenuOpen = false"></div>
      <ProfileMenu
        v-if="profileMenuOpen"
        class="pm-pop"
        @close="profileMenuOpen = false"
        @switched="onProfileSwitched"
      />

      <div v-if="agendaOpen" class="pm-overlay" @click="agendaOpen = false"></div>
      <div v-if="agendaOpen" class="agenda-pop no-drag" @click.stop>
        <div class="agenda-head">
          <i class="fa-solid fa-bell" aria-hidden="true"></i>
          <span>{{ t('agenda.title') }}</span>
        </div>
        <div v-if="!upcoming.length" class="agenda-empty">{{ t('agenda.empty') }}</div>
        <button
          v-for="row in upcoming"
          :key="row.alarm_id"
          class="agenda-row"
          @click="openAgendaNote(row)"
        >
          <span class="a-stripe" :style="{ background: getColor(row.color).accent }"></span>
          <span class="a-main">
            <span class="a-title">{{ agendaTitle(row) }}</span>
            <span class="a-when" :class="{ overdue: row.trigger_at < Date.now() }">
              {{ agendaWhen(row.trigger_at) }}
              <span v-if="repeatLabel(row.repeat_mode)" class="a-repeat">
                · {{ repeatLabel(row.repeat_mode) }}
              </span>
            </span>
          </span>
        </button>
      </div>
    </header>

    <!-- Segmented tabs -->
    <div class="segmented no-drag">
      <button :class="{ on: view === 'notes' }" @click="switchView('notes')">
        <i class="fa-solid fa-layer-group"></i> {{ t('explorer.notes') }}
      </button>
      <button :class="{ on: view === 'archive' }" @click="switchView('archive')">
        <i class="fa-solid fa-box-archive"></i> {{ t('explorer.archive') }}
      </button>
      <button :class="{ on: view === 'trash' }" @click="switchView('trash')">
        <i class="fa-solid fa-trash-can"></i> {{ t('explorer.trash') }}
      </button>
    </div>

    <!-- Search + sorting -->
    <div v-if="view === 'notes'" class="controls no-drag">
      <div class="search">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input v-model="query" :placeholder="t('explorer.search')" @input="onSearchInput" />
        <button v-if="query" class="clear" @click="clearSearch">
          <i class="fa-solid fa-circle-xmark"></i>
        </button>
      </div>
      <select v-model="sortBy" class="sort">
        <option value="updated">{{ t('explorer.sortUpdated') }}</option>
        <option value="created">{{ t('explorer.sortCreated') }}</option>
        <option value="text">{{ t('explorer.sortText') }}</option>
        <option value="starred">{{ t('explorer.sortStarred') }}</option>
      </select>
      <IconBtn
        :icon="
          sortDir === 'asc'
            ? 'fa-solid fa-arrow-up-short-wide'
            : 'fa-solid fa-arrow-down-wide-short'
        "
        :title="t('explorer.sortDirection')"
        @click="toggleSortDir"
      />
    </div>

    <!-- Notebook filters -->
    <div v-if="view === 'notes'" class="notebooks no-drag">
      <button
        class="pill"
        :class="{ on: notebookFilter === 'all' }"
        @click="notebookFilter = 'all'"
      >
        {{ t('explorer.all') }}
      </button>
      <button
        v-for="nb in notebooks"
        :key="nb.id"
        class="pill"
        :class="{ on: notebookFilter === nb.id }"
        :title="t('category.hint')"
        @click="notebookFilter = nb.id"
        @dblclick="renameNotebook(nb)"
        @contextmenu.prevent="removeNotebook(nb)"
      >
        {{ nb.name }} <span class="count">{{ nb.note_count }}</span>
      </button>
      <button class="pill add" :title="t('category.new')" @click="addNotebook">
        <i class="fa-solid fa-plus"></i>
      </button>
    </div>

    <!-- Tag filters -->
    <div v-if="view === 'notes' && allTags.length" class="tagfilter no-drag">
      <button
        v-for="tag in allTags"
        :key="tag.id"
        class="tag-pill"
        :class="{ on: tagFilter === tag.id }"
        :title="t('tag.deleteHint')"
        :style="
          tagFilter === tag.id
            ? { background: getTagColor(tag.color).bg, color: getTagColor(tag.color).fg }
            : {}
        "
        @click="toggleTagFilter(tag.id)"
        @contextmenu.prevent="removeTag(tag)"
      >
        <span class="d" :style="{ background: getTagColor(tag.color).fg }"></span>
        {{ tag.name }}
        <span class="tcount">{{ tag.note_count }}</span>
      </button>
    </div>

    <!-- Saved filters -->
    <div
      v-if="view === 'notes' && (savedFilters.length || canSaveFilter)"
      class="savedfilter no-drag"
    >
      <i class="fa-solid fa-bookmark head" aria-hidden="true"></i>
      <button
        v-for="f in savedFilters"
        :key="f.id"
        class="pill"
        :class="{ on: activeFilterId === f.id }"
        :title="t('filter.deleteHint')"
        @click="applyFilter(f)"
        @contextmenu.prevent="deleteFilter(f)"
      >
        {{ f.name }}
      </button>
      <button
        v-if="canSaveFilter"
        class="pill add"
        :title="t('filter.save')"
        @click="saveCurrentFilter"
      >
        <i class="fa-solid fa-plus"></i> {{ t('filter.save') }}
      </button>
    </div>

    <!-- Multi-select action bar -->
    <div v-if="selected.size >= 1 && view === 'notes'" class="merge-bar no-drag fade-in">
      <span>{{ t('explorer.selected', { count: selected.size }) }}</span>
      <select
        class="bulk-cat"
        @change="(bulk('category', Number($event.target.value)), ($event.target.value = ''))"
      >
        <option value="" disabled selected>{{ t('explorer.bulkCategory') }}</option>
        <option v-for="nb in notebooks" :key="nb.id" :value="nb.id">{{ nb.name }}</option>
      </select>
      <IconBtn
        icon="fa-solid fa-star"
        size="sm"
        :title="t('explorer.star')"
        @click="bulk('star', 1)"
      />
      <IconBtn
        icon="fa-solid fa-box-archive"
        size="sm"
        :title="t('explorer.archive')"
        @click="bulk('archive')"
      />
      <IconBtn
        icon="fa-solid fa-trash"
        size="sm"
        danger
        :title="t('explorer.toTrash')"
        @click="bulkTrash"
      />
      <button v-if="selected.size >= 2" class="merge" @click="mergeSelected">
        <i class="fa-solid fa-object-group"></i> {{ t('explorer.merge') }}
      </button>
      <button class="cancel" @click="selected = new Set()">
        {{ t('explorer.cancelSelection') }}
      </button>
    </div>

    <!-- Note list -->
    <div ref="listEl" class="list no-drag" @scroll="onListScroll">
      <div v-if="visibleNotes.length === 0" class="empty">
        <i
          :class="
            view === 'trash'
              ? 'fa-solid fa-trash-can'
              : view === 'archive'
                ? 'fa-solid fa-box-archive'
                : 'fa-regular fa-note-sticky'
          "
        ></i>
        <p>
          {{
            view === 'trash'
              ? t('explorer.emptyTrash')
              : view === 'archive'
                ? t('explorer.emptyArchive')
                : t('explorer.emptyNotes')
          }}
        </p>
        <button v-if="view === 'notes'" class="empty-add" @click="newNote">
          <i class="fa-solid fa-plus"></i> {{ t('explorer.firstNote') }}
        </button>
      </div>

      <div
        v-for="n in renderedNotes"
        :key="n.id"
        class="card"
        :class="{ sel: selected.has(n.id) }"
        @click="view === 'notes' ? toggleSelect(n, $event) : null"
      >
        <span class="stripe" :style="{ background: getColor(n.color).accent }"></span>
        <div class="card-body">
          <div class="card-head">
            <span class="card-title">{{ titleOf(n) }}</span>
            <span class="date">{{ dateOf(n) }}</span>
          </div>
          <div v-if="previewOf(n)" class="card-preview">{{ previewOf(n) }}</div>
          <div v-if="n.tags && n.tags.length" class="card-tags">
            <TagChips :tags="n.tags" size="sm" />
          </div>
          <div v-if="n.starred || n.locked || n.always_on_top" class="badges">
            <i v-if="n.starred" class="fa-solid fa-star b-star"></i>
            <i v-if="n.locked" class="fa-solid fa-lock"></i>
            <i v-if="n.always_on_top" class="fa-solid fa-thumbtack"></i>
          </div>
        </div>

        <!-- Row actions -->
        <div class="card-actions" @click.stop>
          <template v-if="view === 'notes'">
            <IconBtn
              icon="fa-solid fa-up-right-from-square"
              size="sm"
              :title="t('explorer.open')"
              @click="openNote(n)"
            />
            <IconBtn
              :icon="n.starred ? 'fa-solid fa-star' : 'fa-regular fa-star'"
              size="sm"
              :title="t('explorer.star')"
              :active="!!n.starred"
              @click="toggleStar(n)"
            />
            <IconBtn
              icon="fa-solid fa-box-archive"
              size="sm"
              :title="t('explorer.archive')"
              @click="archive(n)"
            />
            <IconBtn
              icon="fa-solid fa-trash"
              size="sm"
              :title="t('explorer.toTrash')"
              danger
              @click="trash(n)"
            />
          </template>
          <template v-else-if="view === 'archive'">
            <IconBtn
              icon="fa-solid fa-up-right-from-square"
              size="sm"
              :title="t('explorer.open')"
              @click="openNote(n)"
            />
            <IconBtn
              icon="fa-solid fa-box-open"
              size="sm"
              :title="t('explorer.unarchive')"
              @click="unarchive(n)"
            />
            <IconBtn
              icon="fa-solid fa-trash"
              size="sm"
              :title="t('explorer.toTrash')"
              danger
              @click="trash(n)"
            />
          </template>
          <template v-else>
            <IconBtn
              icon="fa-solid fa-rotate-left"
              size="sm"
              :title="t('explorer.restore')"
              @click="restore(n)"
            />
            <IconBtn
              icon="fa-solid fa-xmark"
              size="sm"
              :title="t('explorer.deleteForever')"
              danger
              @click="deleteForever(n)"
            />
          </template>
        </div>
      </div>
    </div>

    <!-- Bottom bar -->
    <footer class="bottombar no-drag">
      <button v-if="view === 'trash'" class="foot danger" @click="emptyTrash">
        <i class="fa-solid fa-trash-can"></i> {{ t('explorer.emptyTrashBtn') }}
      </button>
      <template v-else-if="view === 'notes'">
        <button
          class="foot lock"
          :class="{ on: allLocked }"
          :title="allLocked ? t('explorer.unlockAllTitle') : t('explorer.lockAllTitle')"
          @click="toggleLockAll"
        >
          <i class="fa-solid" :class="allLocked ? 'fa-lock' : 'fa-lock-open'"></i>
          {{ allLocked ? t('explorer.locked') : t('explorer.lockAll') }}
        </button>
        <button class="foot icon" @click="backup" :title="t('explorer.backup')">
          <i class="fa-solid fa-download"></i>
        </button>
        <button class="foot icon" @click="restoreBackup" :title="t('explorer.restoreBtn')">
          <i class="fa-solid fa-upload"></i>
        </button>
      </template>
      <span class="spacer"></span>
      <span class="stat">{{ t('explorer.noteCount', { count: visibleNotes.length }) }}</span>
    </footer>

    <CommandPalette @profiles="profileMenuOpen = true" @refresh="refresh" />
    <ToastHost />
    <DialogHost />
  </div>
</template>

<style scoped>
.explorer {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--x-bg);
  color: var(--x-text);
  font-size: 13px;
}

/* Top bar */
.topbar {
  height: 46px;
  display: flex;
  align-items: center;
  padding: 0 8px 0 8px;
  gap: 3px;
  color: var(--x-text);
  position: relative;
}
.profile-btn {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: transparent;
  color: var(--x-text);
  cursor: pointer;
  padding: 6px 9px;
  border-radius: var(--r-sm);
  min-width: 0;
  transition: background var(--dur) var(--ease);
}
.profile-btn:hover,
.profile-btn.on {
  background: var(--hover);
}
.brand-i {
  color: var(--x-brand);
  font-size: 15px;
  flex: 0 0 auto;
}
.pn {
  font-weight: 650;
  font-size: 13.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lk {
  font-size: 10px;
  color: var(--x-text-faint);
  flex: 0 0 auto;
}
.chev {
  font-size: 9px;
  color: var(--x-text-faint);
  flex: 0 0 auto;
}
.topbar :deep(.icon-btn) {
  color: var(--x-text-dim);
}
.pm-overlay {
  position: fixed;
  inset: 0;
  z-index: 90;
}
.pm-pop {
  position: absolute;
  top: 44px;
  left: 8px;
  z-index: 100;
}

/* Agenda */
.agenda-btn {
  position: relative;
  flex: 0 0 auto;
  border: none;
  background: transparent;
  color: var(--x-text-dim);
  cursor: pointer;
  padding: 7px 9px;
  border-radius: var(--r-sm);
  transition: background var(--dur) var(--ease);
}
.agenda-btn:hover,
.agenda-btn.on {
  background: var(--hover);
}
.agenda-count {
  position: absolute;
  top: 0;
  right: 0;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 7px;
  background: var(--x-brand);
  color: #4a3c00;
  font-size: 9px;
  font-weight: 700;
  line-height: 14px;
  text-align: center;
}
.agenda-pop {
  position: absolute;
  top: 44px;
  right: 8px;
  width: min(300px, calc(100vw - 16px));
  max-height: 60vh;
  overflow-y: auto;
  background: var(--x-surface);
  border: 1px solid var(--x-border);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-pop);
  z-index: 100;
  padding: 6px;
}
.agenda-head {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 8px 8px;
  font-weight: 650;
  font-size: 12.5px;
  color: var(--x-text);
}
.agenda-head > i {
  color: var(--x-brand);
}
.agenda-empty {
  padding: 16px 8px;
  text-align: center;
  color: var(--x-text-faint);
  font-size: 12px;
}
.agenda-row {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  border: none;
  background: transparent;
  color: inherit;
  padding: 8px;
  border-radius: var(--r-sm);
  cursor: pointer;
  text-align: left;
}
.agenda-row:hover {
  background: var(--hover);
}
.agenda-row .a-stripe {
  width: 4px;
  align-self: stretch;
  border-radius: 2px;
  flex: 0 0 auto;
}
.agenda-row .a-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.agenda-row .a-title {
  font-size: 12.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.agenda-row .a-when {
  font-size: 10.5px;
  color: var(--x-text-faint);
}
.agenda-row .a-when.overdue {
  color: var(--x-danger, #d9534f);
  font-weight: 600;
}
.agenda-row .a-repeat {
  opacity: 0.8;
}

/* Segmented control */
.segmented {
  display: flex;
  gap: 2px;
  margin: 0 12px;
  padding: 3px;
  background: var(--hover);
  border-radius: var(--r-md);
}
.segmented button {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--x-text-dim);
  padding: 6px 10px;
  border-radius: var(--r-sm);
  cursor: pointer;
  font-size: 12.5px;
  font-weight: 550;
  transition: all var(--dur) var(--ease);
}
.segmented button i {
  margin-right: 5px;
  font-size: 11px;
}
.segmented button.on {
  background: var(--x-surface);
  color: var(--x-text);
  box-shadow: var(--shadow-1);
}

/* Search + sorting */
.controls {
  display: flex;
  gap: 7px;
  padding: 11px 12px 7px;
  align-items: center;
}
.search {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 7px;
  background: var(--x-surface);
  border: 1px solid var(--x-border);
  border-radius: var(--r-md);
  padding: 0 10px;
  height: 32px;
  transition:
    border-color var(--dur) var(--ease),
    box-shadow var(--dur) var(--ease);
}
.search:focus-within {
  border-color: var(--x-accent);
  box-shadow: 0 0 0 3px rgba(61, 126, 255, 0.13);
}
.search > i {
  color: var(--x-text-faint);
  font-size: 12px;
}
.search input {
  border: none;
  outline: none;
  background: transparent;
  flex: 1;
  font-size: 12.5px;
  color: inherit;
}
.search .clear {
  border: none;
  background: transparent;
  color: var(--x-text-faint);
  cursor: pointer;
  padding: 0;
  font-size: 13px;
}
.search .clear:hover {
  color: var(--x-text-dim);
}
.sort {
  border: 1px solid var(--x-border);
  border-radius: var(--r-md);
  height: 32px;
  background: var(--x-surface);
  font-size: 12px;
  color: inherit;
  padding: 0 6px;
  cursor: pointer;
  outline: none;
}
.controls :deep(.icon-btn) {
  color: var(--x-text-dim);
  border: 1px solid var(--x-border);
  background: var(--x-surface);
  width: 32px;
  height: 32px;
  opacity: 1;
  border-radius: var(--r-md);
}

/* Notebook filters */
.notebooks {
  display: flex;
  gap: 6px;
  padding: 2px 12px 10px;
  flex-wrap: wrap;
  align-items: center;
}
.pill {
  border: 1px solid var(--x-border);
  background: var(--x-surface);
  color: var(--x-text-dim);
  padding: 4px 11px;
  border-radius: var(--r-pill);
  cursor: pointer;
  font-size: 11.5px;
  font-weight: 550;
  transition: all var(--dur) var(--ease);
}
.pill:hover {
  border-color: var(--x-text-faint);
}
.pill.on {
  background: var(--x-brand);
  border-color: var(--x-brand);
  color: #4a3c00;
}
.count {
  opacity: 0.55;
  font-size: 10px;
  margin-left: 2px;
}
.pill.add {
  padding: 4px 9px;
}

/* Tag filters */
.tagfilter {
  display: flex;
  gap: 6px;
  padding: 0 12px 10px;
  flex-wrap: wrap;
  align-items: center;
}
.tag-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--x-border);
  background: var(--x-surface);
  color: var(--x-text-dim);
  padding: 4px 10px;
  border-radius: var(--r-pill);
  cursor: pointer;
  font-size: 11px;
  font-weight: 550;
  transition: all var(--dur) var(--ease);
}
.tag-pill:hover {
  border-color: var(--x-text-faint);
}
.tag-pill.on {
  border-color: transparent;
}
.tag-pill .d {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: 0 0 auto;
}
.tag-pill .tcount {
  opacity: 0.5;
  font-size: 10px;
}

/* Saved filters */
.savedfilter {
  display: flex;
  gap: 6px;
  padding: 0 12px 10px;
  flex-wrap: wrap;
  align-items: center;
}
.savedfilter .head {
  color: var(--x-text-faint);
  font-size: 11px;
  margin-right: 1px;
}

/* Multi-select bar */
.merge-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 12px 8px;
  padding: 8px 11px;
  background: color-mix(in srgb, var(--x-accent) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--x-accent) 24%, transparent);
  border-radius: var(--r-md);
  font-size: 12px;
}
.merge-bar > span {
  flex: 1;
  min-width: 60px;
  color: var(--x-accent);
  font-weight: 550;
}
.merge-bar .bulk-cat {
  border: 1px solid var(--x-border);
  background: var(--x-surface);
  color: var(--x-text);
  border-radius: var(--r-sm);
  font-size: 11px;
  padding: 3px 5px;
  max-width: 110px;
  cursor: pointer;
}
.merge-bar :deep(.icon-btn) {
  color: var(--x-text-dim);
}
.merge-bar .merge {
  border: none;
  background: var(--x-accent);
  color: #fff;
  padding: 5px 11px;
  border-radius: var(--r-sm);
  cursor: pointer;
  font-size: 11.5px;
  font-weight: 550;
}
.merge-bar .cancel {
  border: none;
  background: transparent;
  color: var(--x-text-dim);
  cursor: pointer;
  font-size: 11.5px;
}

/* Note list */
.list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.empty {
  text-align: center;
  color: var(--x-text-faint);
  padding: 48px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.empty i {
  font-size: 30px;
  opacity: 0.5;
}
.empty p {
  margin: 0;
  font-size: 12.5px;
}
.empty-add {
  margin-top: 4px;
  border: 1px solid var(--x-border);
  background: var(--x-surface);
  color: var(--x-text-dim);
  padding: 7px 14px;
  border-radius: var(--r-md);
  cursor: pointer;
  font-size: 12px;
  font-weight: 550;
}
.empty-add:hover {
  border-color: var(--x-accent);
  color: var(--x-accent);
}

.card {
  display: flex;
  align-items: stretch;
  background: var(--x-surface);
  border: 1px solid var(--x-border);
  border-radius: var(--r-md);
  overflow: hidden;
  cursor: pointer;
  position: relative;
  transition:
    border-color var(--dur) var(--ease),
    box-shadow var(--dur) var(--ease),
    transform var(--dur) var(--ease);
}
.card:hover {
  border-color: var(--x-text-faint);
  box-shadow: var(--shadow-2);
}
.card.sel {
  border-color: var(--x-accent);
  box-shadow: 0 0 0 1px var(--x-accent);
}
.stripe {
  width: 4px;
  flex: 0 0 auto;
}
.card-body {
  flex: 1;
  padding: 9px 12px;
  min-width: 0;
}
.card-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.card-title {
  font-weight: 600;
  font-size: 12.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}
.date {
  font-size: 10.5px;
  color: var(--x-text-faint);
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
}
.card-preview {
  font-size: 11.5px;
  color: var(--x-text-dim);
  margin-top: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card-tags {
  display: flex;
  gap: 4px;
  margin-top: 6px;
  flex-wrap: wrap;
}
.badges {
  display: flex;
  gap: 9px;
  margin-top: 6px;
  font-size: 10px;
  color: var(--x-text-faint);
}
.badges .b-star {
  color: #e6a800;
}
.card-actions {
  display: flex;
  align-items: center;
  gap: 1px;
  padding-right: 7px;
  opacity: 0;
  transition: opacity var(--dur) var(--ease);
}
.card:hover .card-actions {
  opacity: 1;
}
.card-actions :deep(.icon-btn) {
  color: var(--x-text-dim);
}

/* Bottom bar */
.bottombar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  background: var(--x-surface);
  border-top: 1px solid var(--x-border);
}
.foot {
  border: none;
  background: transparent;
  color: var(--x-text-dim);
  padding: 6px 10px;
  border-radius: var(--r-sm);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: background var(--dur) var(--ease);
}
.foot i {
  margin-right: 5px;
}
.foot:hover {
  background: var(--hover);
}
.foot.icon i {
  margin-right: 0;
}
.foot.lock.on {
  color: var(--x-brand);
  background: rgba(240, 180, 0, 0.12);
}
.foot.danger {
  color: #d64545;
}
.spacer {
  flex: 1;
}
.stat {
  font-size: 11px;
  color: var(--x-text-faint);
}
</style>
