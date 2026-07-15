<script setup>
/**
 * OptionsMenu — the note's ⋯ menu content (color palette, opacity, toggles,
 * actions). Rendered inside the standalone options window (see OptionsApp) so
 * it can overflow the note's bounds.
 *
 * @prop {object} note - The note being edited.
 * @prop {boolean} [hasAlarm] - Whether the note has an active reminder.
 * @emits update - Partial field changes to persist.
 * @emits action - Named action (alarm, history, duplicate, explorer, copy-md, png,
 *   print, export:*, trash).
 * @emits close - Request to close the menu.
 */
import { computed } from 'vue'
import { COLOR_ORDER, COLORS, isCustomColor } from '../shared/colors'
import ToggleSwitch from '../ui/ToggleSwitch.vue'
import { t } from '../i18n.js'

const props = defineProps({
  note: { type: Object, required: true },
  hasAlarm: { type: Boolean, default: false }
})
const emit = defineEmits(['update', 'action', 'close'])

/** Whether the note uses a custom (non-preset) color. */
const isCustom = computed(() => isCustomColor(props.note.color))

/** Word and character counts for the note's plain text. */
const stats = computed(() => {
  const text = (props.note.plain_text || '').trim()
  return { words: text ? text.split(/\s+/).length : 0, chars: text.length }
})

function setColor(name) {
  emit('update', { color: name })
}
function onOpacity(e) {
  emit('update', { opacity: Number(e.target.value) })
}
function setToggle(field, val) {
  emit('update', { [field]: val ? 1 : 0 })
}
</script>

<template>
  <div class="menu no-drag fade-in" @click.stop>
    <!-- Color palette -->
    <div class="swatches">
      <button
        v-for="name in COLOR_ORDER"
        :key="name"
        class="swatch"
        :class="{ sel: note.color === name }"
        :style="{ background: COLORS[name].bg }"
        :title="t('color.' + name)"
        @click="setColor(name)"
      >
        <i v-if="note.color === name" class="fa-solid fa-check"></i>
      </button>
      <label
        class="swatch custom"
        :class="{ sel: isCustom }"
        :style="isCustom ? { background: note.color } : {}"
        :title="t('color.custom')"
      >
        <input
          type="color"
          :value="isCustom ? note.color : '#7c9cff'"
          @input="setColor($event.target.value)"
        />
        <i :class="isCustom ? 'fa-solid fa-check' : 'fa-solid fa-eye-dropper'"></i>
      </label>
    </div>

    <!-- Opacity -->
    <div class="opacity-row">
      <i class="fa-solid fa-droplet icn"></i>
      <input
        type="range"
        min="0.3"
        max="1"
        step="0.05"
        :value="note.opacity"
        class="slider"
        @input="onOpacity"
      />
      <span class="pct">{{ Math.round(note.opacity * 100) }}</span>
    </div>

    <div class="divider"></div>

    <!-- Toggles -->
    <div class="toggle-row">
      <i class="fa-solid fa-thumbtack icn"></i>
      <span>{{ t('options.alwaysOnTop') }}</span>
      <ToggleSwitch
        :model-value="note.always_on_top"
        @update:model-value="(v) => setToggle('always_on_top', v)"
      />
    </div>
    <div class="toggle-row">
      <i class="fa-solid fa-lock icn"></i>
      <span>{{ t('options.lock') }}</span>
      <ToggleSwitch
        :model-value="note.locked"
        @update:model-value="(v) => setToggle('locked', v)"
      />
    </div>
    <div class="toggle-row">
      <i class="fa-solid fa-star icn"></i>
      <span>{{ t('options.star') }}</span>
      <ToggleSwitch
        :model-value="note.starred"
        @update:model-value="(v) => setToggle('starred', v)"
      />
    </div>

    <div class="divider"></div>

    <!-- Actions -->
    <button class="item" @click="emit('action', 'alarm')">
      <i class="fa-solid fa-bell icn"></i>
      <span>{{ t('options.reminder') }}</span>
      <span v-if="hasAlarm" class="badge-dot"></span>
    </button>
    <button class="item" @click="emit('action', 'history')">
      <i class="fa-solid fa-clock-rotate-left icn"></i>
      <span>{{ t('options.history') }}</span>
    </button>
    <button class="item" @click="emit('action', 'duplicate')">
      <i class="fa-solid fa-clone icn"></i>
      <span>{{ t('options.duplicate') }}</span>
    </button>
    <button class="item" @click="emit('action', 'explorer')">
      <i class="fa-solid fa-table-list icn"></i>
      <span>{{ t('options.explorer') }}</span>
    </button>
    <button class="item" @click="emit('action', 'copy-md')">
      <i class="fa-solid fa-copy icn"></i>
      <span>{{ t('options.copyMarkdown') }}</span>
    </button>
    <button class="item" @click="emit('action', 'png')">
      <i class="fa-solid fa-image icn"></i>
      <span>{{ t('options.exportImage') }}</span>
    </button>
    <button class="item" @click="emit('action', 'print')">
      <i class="fa-solid fa-print icn"></i>
      <span>{{ t('options.print') }}</span>
    </button>

    <div class="export-row">
      <i class="fa-solid fa-file-export icn"></i>
      <span>{{ t('options.export') }}</span>
      <span class="chips">
        <button @click="emit('action', 'export:txt')">TXT</button>
        <button @click="emit('action', 'export:md')">MD</button>
        <button @click="emit('action', 'export:pdf')">PDF</button>
        <button @click="emit('action', 'export:rtf')">RTF</button>
        <button @click="emit('action', 'export:html')">HTML</button>
      </span>
    </div>

    <div class="divider"></div>

    <button class="item danger" @click="emit('action', 'trash')">
      <i class="fa-solid fa-trash icn"></i>
      <span>{{ t('options.trash') }}</span>
    </button>

    <div class="stats">{{ t('options.stats', { words: stats.words, chars: stats.chars }) }}</div>
  </div>
</template>

<style scoped>
.menu {
  width: 224px;
  background: var(--bar);
  color: var(--text);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-pop);
  padding: 9px;
  font-size: 12.5px;
}
.swatches {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
  padding: 2px;
}
.swatch {
  aspect-ratio: 1;
  border-radius: 50%;
  border: 1.5px solid rgba(0, 0, 0, 0.1);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  color: rgba(0, 0, 0, 0.55);
  transition: transform var(--dur) var(--ease);
}
.swatch:hover {
  transform: scale(1.12);
}
.swatch.sel {
  box-shadow:
    0 0 0 2px var(--bar),
    0 0 0 3.5px var(--text);
}
.swatch.custom {
  position: relative;
  overflow: hidden;
  background: conic-gradient(#ff6666, #ffdd66, #66ff66, #66ddff, #6666ff, #ff66ff, #ff6666);
  color: rgba(0, 0, 0, 0.7);
}
.swatch.custom input[type='color'] {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  border: none;
  padding: 0;
}
.opacity-row {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 9px;
  padding: 0 3px;
}
.slider {
  flex: 1;
  height: 4px;
  accent-color: var(--text);
  cursor: pointer;
}
.pct {
  width: 24px;
  text-align: right;
  opacity: 0.65;
  font-variant-numeric: tabular-nums;
  font-size: 11px;
}
.divider {
  height: 1px;
  background: currentColor;
  opacity: 0.09;
  margin: 8px 3px;
}
.toggle-row,
.item,
.export-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 7px 9px;
  border-radius: var(--r-sm);
  font-size: 12.5px;
  color: var(--text);
}
.toggle-row > span,
.item > span,
.export-row > span:first-of-type {
  flex: 1;
  text-align: left;
}
.item {
  border: none;
  background: transparent;
  cursor: pointer;
  transition: background var(--dur) var(--ease);
}
.item:hover {
  background: var(--hover);
}
.icn {
  width: 15px;
  text-align: center;
  opacity: 0.7;
  font-size: 12px;
}
.badge-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #e04848;
  flex: 0 0 auto;
}
.export-row .chips {
  display: flex;
  gap: 4px;
  flex: 0 0 auto;
}
.chips button {
  border: 1px solid currentColor;
  background: transparent;
  color: var(--text);
  border-radius: var(--r-xs);
  font-size: 10px;
  font-weight: 600;
  padding: 3px 6px;
  cursor: pointer;
  opacity: 0.55;
  transition:
    opacity var(--dur) var(--ease),
    background var(--dur) var(--ease);
}
.chips button:hover {
  opacity: 1;
  background: var(--hover);
}
.danger .icn {
  color: #e04848;
}
.danger:hover {
  background: rgba(224, 72, 72, 0.13);
}
.stats {
  text-align: center;
  font-size: 10.5px;
  opacity: 0.55;
  padding: 6px 4px 2px;
  font-variant-numeric: tabular-nums;
}
</style>
