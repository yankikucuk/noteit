<script setup>
/**
 * ToggleSwitch — an iOS-style switch used for note options (always-on-top,
 * lock, star). Accepts boolean or 0/1 for convenience with database columns.
 *
 * @prop {boolean|number} [modelValue] - On/off state.
 * @emits update:modelValue - New boolean state.
 */
defineProps({
  modelValue: { type: [Boolean, Number], default: false }
})
defineEmits(['update:modelValue'])
</script>

<template>
  <button
    class="toggle no-drag"
    :class="{ on: !!modelValue }"
    type="button"
    role="switch"
    :aria-checked="!!modelValue"
    @click.stop="$emit('update:modelValue', !modelValue)"
  >
    <span class="knob"></span>
  </button>
</template>

<style scoped>
.toggle {
  --w: 32px;
  --h: 18px;
  width: var(--w);
  height: var(--h);
  border: none;
  border-radius: var(--r-pill);
  background: rgba(0, 0, 0, 0.18);
  position: relative;
  cursor: pointer;
  padding: 0;
  flex: 0 0 auto;
  transition: background var(--dur) var(--ease);
}
.toggle.on {
  background: var(--accent, #3d7eff);
}
.knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: calc(var(--h) - 4px);
  height: calc(var(--h) - 4px);
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.28);
  transition: transform var(--dur) var(--ease);
}
.toggle.on .knob {
  transform: translateX(calc(var(--w) - var(--h)));
}
</style>
