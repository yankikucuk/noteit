/**
 * @file Debounce helper for the renderer.
 *
 * Collapses bursts of calls (typing, resizing) into a single trailing call,
 * which keeps search-as-you-type from issuing an IPC round-trip per keystroke.
 */

/**
 * Wraps a function so it only runs after `ms` have elapsed since the last call.
 * @template {(...args: any[]) => void} F
 * @param {F} fn - The function to debounce.
 * @param {number} ms - Idle delay in milliseconds.
 * @returns {F & { cancel: () => void }} The debounced function, plus a `cancel`
 *   method that drops any pending call.
 */
export function debounce(fn, ms) {
  let timer = null
  const debounced = (...args) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn(...args)
    }, ms)
  }
  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }
  return debounced
}
