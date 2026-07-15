<script setup>
/**
 * FormatBar — floating formatting toolbar shown at the cursor position when
 * text is right-clicked in a note. Applies TipTap marks/nodes to the active
 * editor and stays open for multiple edits.
 *
 * @prop {object} editor - TipTap editor instance.
 * @prop {number} [x] - Fixed left position in px.
 * @prop {number} [y] - Fixed top position in px.
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import IconBtn from '../ui/IconBtn.vue'
import { t, locale } from '../i18n.js'
import { promptDialog } from '../shared/dialogs.js'

const props = defineProps({
  editor: { type: Object, default: null },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 }
})

const posStyle = computed(() => ({ left: props.x + 'px', top: props.y + 'px' }))

const tick = ref(0)
let handler = null

onMounted(() => {
  if (props.editor) {
    handler = () => tick.value++
    props.editor.on('transaction', handler)
    props.editor.on('selectionUpdate', handler)
  }
})
onBeforeUnmount(() => {
  if (props.editor && handler) {
    props.editor.off('transaction', handler)
    props.editor.off('selectionUpdate', handler)
  }
})

function active(name, attrs) {
  void tick.value
  return props.editor ? props.editor.isActive(name, attrs) : false
}

const chain = () => props.editor.chain().focus()
function toggle(cmd) {
  if (props.editor) cmd(chain()).run()
}

async function setLink() {
  if (!props.editor) return
  const prev = props.editor.getAttributes('link').href
  const url = await promptDialog({ title: t('format.linkPrompt'), value: prev || 'https://' })
  if (url === null) return
  if (url === '') return chain().unsetLink().run()
  chain().extendMarkRange('link').setLink({ href: url }).run()
}

async function insertImage() {
  if (!props.editor) return
  const url = await promptDialog({ title: t('format.imagePrompt'), value: 'https://' })
  if (!url) return
  chain().setImage({ src: url }).run()
}

function insertTable() {
  if (!props.editor) return
  chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
}

function insertDate() {
  if (!props.editor) return
  const now = new Date().toLocaleString(locale.value === 'en' ? 'en-US' : 'tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
  chain()
    .insertContent(now + ' ')
    .run()
}

function clearFormat() {
  chain().unsetAllMarks().clearNodes().run()
}
</script>

<template>
  <div
    v-if="editor"
    class="format-menu no-drag fade-in"
    :style="posStyle"
    @click.stop
    @contextmenu.prevent
  >
    <div class="group">
      <IconBtn
        icon="fa-solid fa-bold"
        size="sm"
        :active="active('bold')"
        :title="t('format.bold')"
        @click="toggle((c) => c.toggleBold())"
      />
      <IconBtn
        icon="fa-solid fa-italic"
        size="sm"
        :active="active('italic')"
        :title="t('format.italic')"
        @click="toggle((c) => c.toggleItalic())"
      />
      <IconBtn
        icon="fa-solid fa-underline"
        size="sm"
        :active="active('underline')"
        :title="t('format.underline')"
        @click="toggle((c) => c.toggleUnderline())"
      />
      <IconBtn
        icon="fa-solid fa-strikethrough"
        size="sm"
        :active="active('strike')"
        :title="t('format.strike')"
        @click="toggle((c) => c.toggleStrike())"
      />
      <IconBtn
        icon="fa-solid fa-highlighter"
        size="sm"
        :active="active('highlight')"
        :title="t('format.highlight')"
        @click="toggle((c) => c.toggleHighlight())"
      />
    </div>

    <span class="sep"></span>

    <div class="group">
      <IconBtn
        icon="fa-solid fa-list-ul"
        size="sm"
        :active="active('bulletList')"
        :title="t('format.bulletList')"
        @click="toggle((c) => c.toggleBulletList())"
      />
      <IconBtn
        icon="fa-solid fa-list-ol"
        size="sm"
        :active="active('orderedList')"
        :title="t('format.orderedList')"
        @click="toggle((c) => c.toggleOrderedList())"
      />
      <IconBtn
        icon="fa-solid fa-square-check"
        size="sm"
        :active="active('taskList')"
        :title="t('format.taskList')"
        @click="toggle((c) => c.toggleTaskList())"
      />
    </div>

    <span class="sep"></span>

    <div class="group">
      <IconBtn
        icon="fa-solid fa-code"
        size="sm"
        :active="active('code')"
        :title="t('format.code')"
        @click="toggle((c) => c.toggleCode())"
      />
      <IconBtn
        icon="fa-solid fa-file-code"
        size="sm"
        :active="active('codeBlock')"
        :title="t('format.codeBlock')"
        @click="toggle((c) => c.toggleCodeBlock())"
      />
      <IconBtn icon="fa-solid fa-image" size="sm" :title="t('format.image')" @click="insertImage" />
      <IconBtn
        icon="fa-solid fa-table-cells"
        size="sm"
        :title="t('format.table')"
        @click="insertTable"
      />
    </div>

    <span class="sep"></span>

    <div class="group">
      <IconBtn
        icon="fa-solid fa-link"
        size="sm"
        :active="active('link')"
        :title="t('format.link')"
        @click="setLink"
      />
      <IconBtn
        icon="fa-solid fa-calendar-day"
        size="sm"
        :title="t('format.date')"
        @click="insertDate"
      />
      <IconBtn
        icon="fa-solid fa-eraser"
        size="sm"
        :title="t('format.clear')"
        @click="clearFormat"
      />
    </div>
  </div>
</template>

<style scoped>
.format-menu {
  position: fixed;
  z-index: 60;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px;
  padding: 4px 6px;
  max-width: calc(100vw - 12px);
  color: var(--text);
  background: var(--bar);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-pop);
}
.group {
  display: flex;
  align-items: center;
  gap: 1px;
  flex: 0 0 auto;
}
.sep {
  width: 1px;
  height: 15px;
  background: currentColor;
  opacity: 0.14;
  flex: 0 0 auto;
}
</style>
