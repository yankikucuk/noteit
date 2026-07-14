<script setup>
/**
 * ToastHost — renders the shared toast queue as a stack of dismissible
 * notifications. Drop one instance into each window's root component. Installs
 * the global error-to-toast listeners on mount.
 */
import { onMounted } from 'vue'
import { toasts, dismissToast, installGlobalErrorToasts } from '../shared/toast.js'
import { t } from '../i18n.js'

onMounted(installGlobalErrorToasts)

/**
 * Maps a toast type to its Font Awesome icon.
 * @param {string} type - Toast type.
 * @returns {string} Icon class.
 */
function iconFor(type) {
  if (type === 'success') return 'fa-circle-check'
  if (type === 'error') return 'fa-circle-exclamation'
  return 'fa-circle-info'
}
</script>

<template>
  <div class="toast-host no-drag" role="status" aria-live="polite">
    <transition-group name="toast">
      <div v-for="toast in toasts" :key="toast.id" class="toast" :class="toast.type">
        <i class="fa-solid" :class="iconFor(toast.type)" aria-hidden="true"></i>
        <span class="msg">{{ toast.message }}</span>
        <button class="x" :aria-label="t('history.close')" @click="dismissToast(toast.id)">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  z-index: 2000;
  pointer-events: none;
}
.toast {
  display: flex;
  align-items: center;
  gap: 9px;
  max-width: 92vw;
  padding: 8px 12px;
  border-radius: 10px;
  background: #2b2f36;
  color: #fff;
  font-size: 12.5px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.32);
  pointer-events: auto;
}
.toast.success {
  background: #1f7a44;
}
.toast.error {
  background: #b23b3b;
}
.toast > i {
  font-size: 13px;
  opacity: 0.9;
  flex: 0 0 auto;
}
.msg {
  flex: 1;
}
.x {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  opacity: 0.7;
  padding: 0 0 0 4px;
  font-size: 12px;
}
.x:hover {
  opacity: 1;
}
.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
