import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { debounce } from '../src/renderer/src/shared/debounce.js'

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('runs once after the idle delay, with the latest arguments', () => {
    const fn = vi.fn()
    const d = debounce(fn, 100)
    d('a')
    d('b')
    d('c')
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('c')
  })

  it('restarts the timer on each call', () => {
    const fn = vi.fn()
    const d = debounce(fn, 100)
    d()
    vi.advanceTimersByTime(60)
    d()
    vi.advanceTimersByTime(60)
    expect(fn).not.toHaveBeenCalled() // 120ms elapsed but reset at 60ms
    vi.advanceTimersByTime(40)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('cancel drops a pending call', () => {
    const fn = vi.fn()
    const d = debounce(fn, 100)
    d()
    d.cancel()
    vi.advanceTimersByTime(200)
    expect(fn).not.toHaveBeenCalled()
  })
})
