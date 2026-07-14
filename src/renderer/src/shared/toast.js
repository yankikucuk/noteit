/**
 * @file Lightweight toast notifications for the renderer.
 *
 * A tiny reactive store shared by every window: {@link pushToast} appends a
 * message that auto-dismisses, and {@link ToastHost} renders the queue.
 * {@link installGlobalErrorToasts} additionally surfaces otherwise-silent
 * failures (rejected IPC promises, runtime errors) as a generic error toast.
 */

import { ref } from 'vue'
import { t } from '../i18n.js'

/** Monotonic id generator for toasts. */
let seq = 0

/** Suppress an identical toast fired again within this window (ms). */
const DEDUPE_MS = 600

/** Last shown message/type/time, to collapse rapid duplicates. */
let last = { message: null, type: null, at: 0 }

/** Active toasts (reactive). @type {import('vue').Ref<Array<{id:number,message:string,type:string}>>} */
export const toasts = ref([])

/**
 * Shows a toast. Identical messages fired within {@link DEDUPE_MS} are collapsed
 * so a burst of failures does not stack duplicate notifications.
 * @param {string} message - Text to display (already localized).
 * @param {'info'|'success'|'error'} [type] - Visual style.
 * @param {number} [timeout] - Auto-dismiss delay in ms; 0 keeps it until dismissed.
 * @returns {number} The toast id (0 when suppressed as a duplicate).
 */
export function pushToast(message, type = 'info', timeout = 3200) {
  const now = Date.now()
  if (message === last.message && type === last.type && now - last.at < DEDUPE_MS) return 0
  last = { message, type, at: now }
  const id = ++seq
  toasts.value = [...toasts.value, { id, message, type }]
  if (timeout) setTimeout(() => dismissToast(id), timeout)
  return id
}

/**
 * Removes a toast by id.
 * @param {number} id - Toast id.
 */
export function dismissToast(id) {
  toasts.value = toasts.value.filter((toast) => toast.id !== id)
}

/** Whether the global error listeners have been attached (install once). */
let installed = false

/**
 * Installs window-level listeners that turn unhandled promise rejections and
 * uncaught errors into a single generic error toast, so backend/IPC failures
 * never fail silently. Safe to call from every window; only the first call
 * attaches the listeners.
 */
export function installGlobalErrorToasts() {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('unhandledrejection', () => pushToast(t('toast.error'), 'error'))
  window.addEventListener('error', () => pushToast(t('toast.error'), 'error'))
}

/**
 * Wires a Vue app's error handler to surface uncaught component errors as a
 * generic error toast (and log them), complementing the window-level listeners.
 * @param {import('vue').App} app - The Vue application instance.
 */
export function attachVueErrorHandler(app) {
  app.config.errorHandler = (err, _instance, info) => {
    console.error('Vue error:', err, info)
    pushToast(t('toast.error'), 'error')
  }
}
