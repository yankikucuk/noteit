import { describe, it, expect } from 'vitest'
import { computeNextTrigger, parseRepeat } from '../src/shared/recurrence.js'

/** 2026-03-15 09:30 local time (a Sunday). */
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

  it('advances an every-N-days custom rule', () => {
    const next = new Date(computeNextTrigger(base, 'everyDays:3'))
    expect(next.getDate()).toBe(18) // 15 + 3
    expect(`${next.getHours()}:${next.getMinutes()}`).toBe('9:30')
  })

  it('advances a weekdays rule to the next selected day', () => {
    // base is a Sunday (day 0); next selected among Mon(1)/Wed(3) is Monday.
    const next = new Date(computeNextTrigger(base, 'weekdays:1,3'))
    expect(next.getDay()).toBe(1)
    expect(next.getDate()).toBe(16)
  })

  it('wraps a weekdays rule across the week boundary', () => {
    // From Sunday, the only selected day Saturday(6) lands six days later.
    const next = new Date(computeNextTrigger(base, 'weekdays:6'))
    expect(next.getDay()).toBe(6)
    expect(next.getDate()).toBe(21)
  })

  it('treats malformed custom rules as one-shot', () => {
    expect(computeNextTrigger(base, 'everyDays:0')).toBeNull()
    expect(computeNextTrigger(base, 'weekdays:9')).toBeNull()
    expect(computeNextTrigger(base, 'everyDays:x')).toBeNull()
  })
})

describe('parseRepeat', () => {
  it('recognises presets', () => {
    expect(parseRepeat('daily')).toEqual({ kind: 'daily' })
    expect(parseRepeat('yearly')).toEqual({ kind: 'yearly' })
  })

  it('parses custom rules and dedupes/sorts weekdays', () => {
    expect(parseRepeat('everyDays:5')).toEqual({ kind: 'everyDays', n: 5 })
    expect(parseRepeat('weekdays:5,1,3,1')).toEqual({ kind: 'weekdays', days: [1, 3, 5] })
  })

  it('falls back to once for unknown or malformed input', () => {
    expect(parseRepeat('once')).toEqual({ kind: 'once' })
    expect(parseRepeat('nonsense')).toEqual({ kind: 'once' })
    expect(parseRepeat(undefined)).toEqual({ kind: 'once' })
  })
})
