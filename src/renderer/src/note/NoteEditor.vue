<script setup>
/**
 * NoteEditor — thin wrapper around a TipTap editor. Emits content changes
 * (HTML + plain text) for autosave and exposes imperative helpers for the
 * parent (external content updates, focus).
 *
 * @prop {string} [modelValue] - Note HTML content.
 * @prop {boolean} [editable] - Whether editing is allowed (false when locked).
 * @emits update:modelValue - New HTML content.
 * @emits change - `{ html, text }` on every edit.
 * @emits ready - The TipTap editor instance once created.
 */
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { Editor, EditorContent } from '@tiptap/vue-3'
import { buildExtensions } from '../shared/editor'
import { downscaleImage, firstImageFile } from '../shared/image'

const props = defineProps({
  modelValue: { type: String, default: '' },
  editable: { type: Boolean, default: true }
})
const emit = defineEmits(['update:modelValue', 'change', 'ready'])

const editor = ref(null)

/**
 * Inserts a pasted/dropped image after downscaling it. Returns true (handled)
 * when the payload contains an image so ProseMirror skips its default handling.
 * @param {DataTransfer|null} dt - Clipboard or drop data.
 * @returns {boolean} Whether an image was handled.
 */
function handleImageTransfer(dt) {
  const file = firstImageFile(dt)
  if (!file) return false
  downscaleImage(file)
    .then((src) => editor.value?.chain().focus().setImage({ src }).run())
    .catch(() => {})
  return true
}

onMounted(() => {
  editor.value = new Editor({
    content: props.modelValue || '',
    editable: props.editable,
    extensions: buildExtensions(),
    editorProps: {
      handlePaste: (_view, event) => handleImageTransfer(event.clipboardData),
      handleDrop: (_view, event) => handleImageTransfer(event.dataTransfer)
    },
    onUpdate: ({ editor }) => {
      // Serialise the document once per edit — getHTML/getText walk the whole
      // document, which matters on large notes at typing speed.
      const html = editor.getHTML()
      emit('update:modelValue', html)
      emit('change', { html, text: editor.getText() })
    }
  })
  emit('ready', editor.value)
})

onBeforeUnmount(() => editor.value?.destroy())

watch(
  () => props.editable,
  (v) => editor.value?.setEditable(v)
)

/**
 * Replaces the document from outside (e.g. after a merge or version restore)
 * without emitting an update. Note: the selection resets to the document start.
 * @param {string} html - New note HTML.
 */
function setContentFromOutside(html) {
  const ed = editor.value
  if (ed && html !== ed.getHTML()) {
    ed.commands.setContent(html, false)
  }
}

function focus() {
  editor.value?.commands.focus()
}

defineExpose({ editor, setContentFromOutside, focus })
</script>

<template>
  <editor-content v-if="editor" :editor="editor" class="editor-host" />
</template>

<style scoped>
.editor-host {
  height: 100%;
}
.editor-host :deep(.ProseMirror) {
  padding: 8px 12px 12px;
  min-height: 100%;
}
</style>
