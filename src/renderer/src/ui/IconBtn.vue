<script setup>
/**
 * IconBtn — a compact, reusable icon button used across every window (title
 * bars, format menu, Explorer, cards). Non-draggable so it works inside
 * frameless drag regions.
 *
 * @prop {string} icon - Font Awesome class, e.g. "fa-solid fa-plus".
 * @prop {string} [title] - Native tooltip.
 * @prop {boolean} [active] - Highlighted (toggled-on) state.
 * @prop {boolean} [danger] - Red hover treatment (destructive action).
 * @prop {'sm'|'md'} [size] - Button size.
 * @emits click - Forwards the native click event.
 */
defineProps({
  icon: { type: String, required: true },
  title: { type: String, default: '' },
  active: { type: Boolean, default: false },
  danger: { type: Boolean, default: false },
  size: { type: String, default: 'md' } // 'sm' | 'md'
})
defineEmits(['click'])
</script>

<template>
  <button
    class="icon-btn no-drag"
    :class="[size, { active, danger }]"
    :title="title"
    :aria-label="title || undefined"
    :aria-pressed="active || undefined"
    type="button"
    @click.stop="$emit('click', $event)"
  >
    <i :class="icon" aria-hidden="true"></i>
  </button>
</template>

<style scoped>
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: currentColor;
  cursor: pointer;
  border-radius: var(--r-sm);
  opacity: 0.62;
  flex: 0 0 auto;
  transition:
    background var(--dur) var(--ease),
    opacity var(--dur) var(--ease),
    transform var(--dur) var(--ease),
    color var(--dur) var(--ease);
}
.icon-btn.md {
  width: 27px;
  height: 27px;
  font-size: 12.5px;
}
.icon-btn.sm {
  width: 23px;
  height: 23px;
  font-size: 11px;
}
.icon-btn:hover {
  opacity: 1;
  background: var(--hover);
}
.icon-btn:active {
  transform: scale(0.92);
}
.icon-btn.active {
  opacity: 1;
  background: var(--hover-strong);
}
.icon-btn.danger:hover {
  background: rgba(230, 72, 72, 0.9);
  color: #fff;
}
</style>
