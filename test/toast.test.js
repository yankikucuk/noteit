import { describe, it, expect, beforeEach } from 'vitest'
import { toasts, pushToast, dismissToast } from '../src/renderer/src/shared/toast.js'

describe('toast store', () => {
  beforeEach(() => {
    toasts.value = []
  })

  it('appends a toast with an id and type', () => {
    const id = pushToast('Saved', 'success', 0)
    expect(toasts.value).toHaveLength(1)
    expect(toasts.value[0]).toMatchObject({ id, message: 'Saved', type: 'success' })
  })

  it('defaults to the info type', () => {
    pushToast('Heads up', undefined, 0)
    expect(toasts.value[0].type).toBe('info')
  })

  it('dismisses a toast by id', () => {
    const id = pushToast('Bye', 'info', 0)
    dismissToast(id)
    expect(toasts.value).toHaveLength(0)
  })

  it('auto-dismisses after the timeout', async () => {
    pushToast('Temporary', 'info', 20)
    expect(toasts.value).toHaveLength(1)
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(toasts.value).toHaveLength(0)
  })

  it('gives each toast a unique id', () => {
    const a = pushToast('a', 'info', 0)
    const b = pushToast('b', 'info', 0)
    expect(a).not.toBe(b)
  })
})
