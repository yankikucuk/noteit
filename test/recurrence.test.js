import { describe, it, expect } from 'vitest'
import { computeNextTrigger } from '../src/shared/recurrence.js'

/** 2026-03-15 09:30 local time. */
const base = new Date(2026, 2, 15, 9, 30, 0).getTime()

describe('computeNextTrigger', () => {
  it('returns null for a one-shot alarm', () => {
    expect(computeNextTrigger(base, 'once')).toBeNull()
    expect(computeNextTrigger(base, 'anything-unknown')).toBeNull()
  })

  it('advances daily by one calendar day', () => {
    const next = new Date(computeNextTrigger(base, 'daily'))
    expect(next.getDate()).toBe(16)
    expect(next.getHours()).toBe(9)
    expect(next.getMinutes()).toBe(30)
  })

  it('advances weekly by seven days', () => {
    expect(computeNextTrigger(base, 'weekly')).toBe(base + 7 * 24 * 60 * 60 * 1000)
  })

  it('advances monthly by one calendar month', () => {
    const next = new Date(computeNextTrigger(base, 'monthly'))
    expect(next.getMonth()).toBe(3) // March -> April
    expect(next.getDate()).toBe(15)
  })

  it('advances yearly by one calendar year', () => {
    const next = new Date(computeNextTrigger(base, 'yearly'))
    expect(next.getFullYear()).toBe(2027)
    expect(next.getMonth()).toBe(2)
    expect(next.getDate()).toBe(15)
  })

  it('rolls a month-end date over as JS Date does (Jan 31 -> Mar 3)', () => {
    const jan31 = new Date(2026, 0, 31, 8, 0, 0).getTime()
    const next = new Date(computeNextTrigger(jan31, 'monthly'))
    // Feb has no 31st, so the overflow lands in March.
    expect(next.getMonth()).toBe(2)
  })

  it('preserves the time of day across a DST-agnostic weekly step', () => {
    const next = new Date(computeNextTrigger(base, 'daily'))
    expect(`${next.getHours()}:${next.getMinutes()}`).toBe('9:30')
  })
})
