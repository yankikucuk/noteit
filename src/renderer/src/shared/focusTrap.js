/**
 * @file Modal focus management.
 *
 * A small composable that keeps keyboard focus inside a dialog while it is open
 * and restores focus to the previously focused element when it closes — the
 * baseline accessibility contract for a modal.
 */

import { onMounted, onBeforeUnmount } from 'vue'

/** Selector for elements that can receive keyboard focus. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Traps Tab focus within the referenced element while mounted, focuses its first
 * focusable control on mount, and restores the prior focus on unmount.
 * @param {import('vue').Ref<HTMLElement|null>} containerRef - The dialog root.
 */
export function useFocusTrap(containerRef) {
  let previouslyFocused = null

  /**
   * Wraps Tab/Shift+Tab focus at the dialog's boundaries.
   * @param {KeyboardEvent} e - Keydown event.
   */
  function onKeydown(e) {
    if (e.key !== 'Tab') return
    const root = containerRef.value
    if (!root) return
    const focusable = [...root.querySelectorAll(FOCUSABLE)]
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  onMounted(() => {
    previouslyFocused = document.activeElement
    const root = containerRef.value
    const target = root?.querySelector(FOCUSABLE) || root
    target?.focus?.()
    document.addEventListener('keydown', onKeydown, true)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKeydown, true)
    previouslyFocused?.focus?.()
  })
}
