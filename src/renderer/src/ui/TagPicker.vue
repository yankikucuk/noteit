<script setup>
/**
 * TagPicker — popover to search, toggle, and create tags for a note. New tags
 * are auto-assigned the next palette color. Add/remove is applied immediately
 * via the API; the parent is notified through the `changed` event.
 *
 * @prop {number} noteId - Note being edited.
 * @prop {Array} [modelTags] - The note's current tags.
 * @emits changed - Emits the note's updated tag list.
 * @emits close - Request to close the picker.
 */
import { ref, computed, onMounted, nextTick } from 'vue'
import { TAG_COLOR_ORDER, getTagColor } from '../shared/colors'
import { t } from '../i18n.js'

const props = defineProps({
  noteId: { type: Number, required: true },
  modelTags: { type: Array, default: () => [] }
})
const emit = defineEmits(['changed', 'close'])

const allTags = ref([])
const query = ref('')
const selectedIds = ref(new Set(props.modelTags.map((t) => t.id)))
const inputEl = ref(null)

onMounted(async () => {
  allTags.value = await window.api.tags.list()
  await nextTick()
  inputEl.value?.focus()
})

const filtered = computed(() => {
  const q = query.value.trim().toLocaleLowerCase('tr')
  if (!q) return allTags.value
  return allTags.value.filter((t) => t.name.toLocaleLowerCase('tr').includes(q))
})

const canCreate = computed(() => {
  const q = query.value.trim()
  return (
    q && !allTags.value.some((t) => t.name.toLocaleLowerCase('tr') === q.toLocaleLowerCase('tr'))
  )
})

function isSelected(id) {
  return selectedIds.value.has(id)
}

async function toggle(tag) {
  if (selectedIds.value.has(tag.id)) {
    await window.api.notes.removeTag(props.noteId, tag.id)
    selectedIds.value.delete(tag.id)
  } else {
    await window.api.notes.addTag(props.noteId, tag.id)
    selectedIds.value.add(tag.id)
  }
  selectedIds.value = new Set(selectedIds.value)
  await emitChanged()
}

async function createAndAdd() {
  const name = query.value.trim()
  if (!name) return
  const color = TAG_COLOR_ORDER[allTags.value.length % TAG_COLOR_ORDER.length]
  const tag = await window.api.tags.create(name, color)
  allTags.value = await window.api.tags.list()
  if (tag && !selectedIds.value.has(tag.id)) {
    await window.api.notes.addTag(props.noteId, tag.id)
    selectedIds.value.add(tag.id)
    selectedIds.value = new Set(selectedIds.value)
  }
  query.value = ''
  await emitChanged()
}

function onEnter() {
  if (canCreate.value) return createAndAdd()
  if (filtered.value.length) return toggle(filtered.value[0])
}

async function emitChanged() {
  const note = await window.api.notes.get(props.noteId)
  emit('changed', note?.tags || [])
}
</script>

<template>
  <div class="tag-picker no-drag fade-in" @click.stop>
    <div class="search">
      <i class="fa-solid fa-tag"></i>
      <input
        ref="inputEl"
        v-model="query"
        :placeholder="t('tag.searchOrCreate')"
        @keydown.enter.prevent="onEnter"
        @keydown.esc.prevent="emit('close')"
      />
    </div>

    <div class="list">
      <button
        v-for="tag in filtered"
        :key="tag.id"
        class="row"
        :class="{ on: isSelected(tag.id) }"
        @click="toggle(tag)"
      >
        <span class="dot" :style="{ background: getTagColor(tag.color).fg }"></span>
        <span class="name">{{ tag.name }}</span>
        <span class="cnt">{{ tag.note_count }}</span>
        <i v-if="isSelected(tag.id)" class="fa-solid fa-check chk"></i>
      </button>

      <button v-if="canCreate" class="row create" @click="createAndAdd">
        <i class="fa-solid fa-plus"></i>
        <span class="name">{{ t('tag.create', { name: query.trim() }) }}</span>
      </button>

      <div v-if="!filtered.length && !canCreate" class="empty">{{ t('tag.empty') }}</div>
    </div>
  </div>
</template>

<style scoped>
.tag-picker {
  width: 210px;
  background: var(--x-surface, #fff);
  color: var(--x-text, #222);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-pop);
  overflow: hidden;
  font-size: 12.5px;
}
.search {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 11px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}
.search i {
  color: var(--x-text-faint, #aaa);
  font-size: 11px;
}
.search input {
  border: none;
  outline: none;
  background: transparent;
  flex: 1;
  font-size: 12.5px;
  color: inherit;
}
.list {
  max-height: 220px;
  overflow-y: auto;
  padding: 5px;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: none;
  background: transparent;
  padding: 6px 8px;
  border-radius: var(--r-sm);
  cursor: pointer;
  color: inherit;
  font-size: 12.5px;
  text-align: left;
}
.row:hover {
  background: rgba(0, 0, 0, 0.06);
}
.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex: 0 0 auto;
}
.name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cnt {
  font-size: 10.5px;
  color: var(--x-text-faint, #aaa);
}
.chk {
  font-size: 10px;
  color: var(--x-accent, #3d7eff);
}
.row.on .name {
  font-weight: 600;
}
.row.create {
  color: var(--x-accent, #3d7eff);
}
.row.create i {
  font-size: 10px;
}
.empty {
  text-align: center;
  color: var(--x-text-faint, #aaa);
  padding: 14px;
  font-size: 12px;
}
</style>
