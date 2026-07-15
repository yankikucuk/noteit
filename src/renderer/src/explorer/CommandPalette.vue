<script setup>
/**
 * CommandPalette — a Cmd/Ctrl+K launcher for the Explorer window. Filters a set
 * of actions and, once you type, searches notes too. Arrow keys move the
 * selection, Enter runs it, Escape closes.
 *
 * @emits profiles - Request to open the profile switcher.
 * @emits refresh - Ask the Explorer to reload after an action.
 */
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { t } from '../i18n.js'
import { promptDialog } from '../shared/dialogs.js'
import { pushToast } from '../shared/toast.js'
import { getColor } from '../shared/colors'

const emit = defineEmits(['profiles', 'refresh'])

const open = ref(false)
const query = ref('')
const activeIndex = ref(0)
const noteResults = ref([])
const globalResults = ref([])
const inputEl = ref(null)

/** Creates a category via a prompt, then asks the Explorer to reload. */
async function newCategory() {
  const name = await promptDialog({ title: t('category.newPrompt') })
  if (name) {
    await window.api.notebooks.create(name)
    emit('refresh')
  }
}

/** Runs a manual backup and confirms with a toast. */
async function doBackup() {
  const r = await window.api.backup.create()
  if (r.ok) pushToast(t('toast.backupCreated'), 'success')
}

/** Static action commands. `label` is a function so it re-localises live. */
const COMMANDS = [
  {
    icon: 'fa-solid fa-plus',
    label: () => t('cmd.newNote'),
    run: () => window.api.notes.create({})
  },
  { icon: 'fa-solid fa-folder-plus', label: () => t('cmd.newCategory'), run: newCategory },
  { icon: 'fa-solid fa-user', label: () => t('cmd.switchProfile'), run: () => emit('profiles') },
  {
    icon: 'fa-solid fa-gear',
    label: () => t('cmd.settings'),
    run: () => window.api.settings.open()
  },
  {
    icon: 'fa-solid fa-sun',
    label: () => t('cmd.themeLight'),
    run: () => window.api.settings.set('theme', 'light')
  },
  {
    icon: 'fa-solid fa-moon',
    label: () => t('cmd.themeDark'),
    run: () => window.api.settings.set('theme', 'dark')
  },
  {
    icon: 'fa-solid fa-circle-half-stroke',
    label: () => t('cmd.themeSystem'),
    run: () => window.api.settings.set('theme', 'system')
  },
  { icon: 'fa-solid fa-download', label: () => t('cmd.backup'), run: doBackup },
  {
    icon: 'fa-solid fa-file-import',
    label: () => t('cmd.import'),
    run: () => window.api.data.import()
  },
  {
    icon: 'fa-brands fa-markdown',
    label: () => t('cmd.importMarkdown'),
    run: () => window.api.data.importMarkdown()
  }
]

const filteredCommands = computed(() => {
  const q = query.value.trim().toLocaleLowerCase('tr')
  if (!q) return COMMANDS
  return COMMANDS.filter((c) => c.label().toLocaleLowerCase('tr').includes(q))
})

/** Flat list of selectable items: commands, then current- then other-profile notes. */
const items = computed(() => [
  ...filteredCommands.value.map((c) => ({ type: 'command', command: c })),
  ...noteResults.value.map((n) => ({ type: 'note', note: n })),
  ...globalResults.value.map((n) => ({ type: 'global', note: n }))
])

watch(query, async (q) => {
  activeIndex.value = 0
  const term = q.trim()
  if (term.length >= 2) {
    // Current-profile notes, plus notes in other (unprotected) profiles.
    noteResults.value = (await window.api.notes.search(term)).slice(0, 8)
    globalResults.value = (await window.api.notes.searchGlobal(term)).slice(0, 6)
  } else {
    noteResults.value = []
    globalResults.value = []
  }
})

/** First non-empty line of a note, for the result label. */
function noteTitle(n) {
  return (n.plain_text || '').trim().split('\n')[0] || t('note.empty')
}

function openPalette() {
  open.value = true
  query.value = ''
  noteResults.value = []
  globalResults.value = []
  activeIndex.value = 0
  nextTick(() => inputEl.value?.focus())
}
function closePalette() {
  open.value = false
}

async function runItem(item) {
  if (!item) return
  closePalette()
  if (item.type === 'command') {
    item.command.run()
  } else if (item.type === 'global') {
    // Jump across profiles: switch to the note's (unprotected) profile, then open.
    await window.api.profiles.switch(item.note.profile_id)
    window.api.notes.open(item.note.id)
  } else {
    window.api.notes.open(item.note.id)
  }
}

function onKeydown(e) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    open.value ? closePalette() : openPalette()
    return
  }
  if (!open.value) return
  if (e.key === 'Escape') {
    e.preventDefault()
    closePalette()
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = Math.min(activeIndex.value + 1, items.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = Math.max(activeIndex.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    runItem(items.value[activeIndex.value])
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div v-if="open" class="cmd-overlay no-drag" @click.self="closePalette">
    <div class="cmd" role="dialog" aria-modal="true" :aria-label="t('cmd.placeholder')">
      <div class="cmd-search">
        <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
        <input ref="inputEl" v-model="query" :placeholder="t('cmd.placeholder')" />
      </div>
      <div class="cmd-list">
        <button
          v-for="(item, i) in items"
          :key="item.note ? item.type + item.note.id : 'c' + i"
          class="cmd-item"
          :class="{ active: i === activeIndex }"
          @mousemove="activeIndex = i"
          @click="runItem(item)"
        >
          <template v-if="item.type === 'command'">
            <i :class="item.command.icon" aria-hidden="true"></i>
            <span class="lbl">{{ item.command.label() }}</span>
          </template>
          <template v-else>
            <span class="stripe" :style="{ background: getColor(item.note.color).accent }"></span>
            <span class="lbl">{{ noteTitle(item.note) }}</span>
            <span class="hint">
              {{
                item.type === 'global'
                  ? t('cmd.inProfile', { name: item.note.profile_name })
                  : t('cmd.openNote')
              }}
            </span>
          </template>
        </button>
        <div v-if="!items.length" class="cmd-empty">{{ t('cmd.empty') }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cmd-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 14vh;
  z-index: 300;
}
.cmd {
  width: min(440px, calc(100vw - 24px));
  max-height: 62vh;
  display: flex;
  flex-direction: column;
  background: var(--x-surface);
  color: var(--x-text);
  border: 1px solid var(--x-border);
  border-radius: 12px;
  box-shadow: var(--shadow-pop);
  overflow: hidden;
}
.cmd-search {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--x-border);
}
.cmd-search > i {
  color: var(--x-text-faint);
}
.cmd-search input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: inherit;
  font-size: 14px;
}
.cmd-list {
  overflow-y: auto;
  padding: 6px;
}
.cmd-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  border: none;
  background: transparent;
  color: inherit;
  padding: 9px 10px;
  border-radius: var(--r-sm);
  cursor: pointer;
  font-size: 13px;
  text-align: left;
}
.cmd-item.active {
  background: var(--hover);
}
.cmd-item > i {
  width: 16px;
  text-align: center;
  color: var(--x-text-dim);
}
.cmd-item .stripe {
  width: 4px;
  height: 15px;
  border-radius: 2px;
  flex: 0 0 auto;
}
.cmd-item .lbl {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cmd-item .hint {
  font-size: 10.5px;
  color: var(--x-text-faint);
}
.cmd-empty {
  text-align: center;
  color: var(--x-text-faint);
  padding: 22px;
  font-size: 12.5px;
}
</style>
