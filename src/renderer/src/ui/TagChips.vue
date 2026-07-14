<script setup>
/**
 * TagChips — renders a list of colored tag chips, optionally removable.
 *
 * @prop {Array<{id:number,name:string,color:string}>} tags - Tags to render.
 * @prop {boolean} [removable] - Show a remove (×) button on each chip.
 * @prop {'sm'|'md'} [size] - Chip size.
 * @emits remove - Emits the tag id to remove.
 */
import { getTagColor } from '../shared/colors'
import { t } from '../i18n.js'

defineProps({
  tags: { type: Array, default: () => [] },
  removable: { type: Boolean, default: false },
  size: { type: String, default: 'md' } // 'sm' | 'md'
})
defineEmits(['remove'])
</script>

<template>
  <span
    v-for="tag in tags"
    :key="tag.id"
    class="chip"
    :class="size"
    :style="{ background: getTagColor(tag.color).bg, color: getTagColor(tag.color).fg }"
  >
    <span class="label">{{ tag.name }}</span>
    <button
      v-if="removable"
      class="x"
      :title="t('tag.remove')"
      @click.stop="$emit('remove', tag.id)"
    >
      <i class="fa-solid fa-xmark"></i>
    </button>
  </span>
</template>

<style scoped>
.chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border-radius: var(--r-pill);
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  flex: 0 0 auto;
}
.chip.md {
  padding: 3px 8px;
  font-size: 11px;
}
.chip.sm {
  padding: 2px 7px;
  font-size: 10px;
}
.label {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.x {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 0;
  opacity: 0.55;
  font-size: 9px;
  display: inline-flex;
}
.x:hover {
  opacity: 1;
}
</style>
