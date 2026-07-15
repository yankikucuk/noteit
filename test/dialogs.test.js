import { describe, it, expect, beforeEach } from 'vitest'
import {
  activeDialog,
  promptDialog,
  confirmDialog,
  close
} from '../src/renderer/src/shared/dialogs.js'

describe('dialog store', () => {
  beforeEach(() => close(null))

  it('opens a prompt and resolves with the entered value', async () => {
    const p = promptDialog({ title: 'Name' })
    expect(activeDialog.value).toMatchObject({ kind: 'prompt', title: 'Name' })
    close('hello')
    expect(await p).toBe('hello')
    expect(activeDialog.value).toBeNull()
  })

  it('resolves a prompt with null on cancel', async () => {
    const p = promptDialog({})
    close(null)
    expect(await p).toBeNull()
  })

  it('opens a confirm and resolves true/false', async () => {
    const p = confirmDialog({ message: 'Sure?' })
    expect(activeDialog.value.kind).toBe('confirm')
    close(true)
    expect(await p).toBe(true)
  })

  it('passes through descriptor options (danger, confirmLabel)', () => {
    confirmDialog({ message: 'x', confirmLabel: 'Delete', danger: true })
    expect(activeDialog.value).toMatchObject({ confirmLabel: 'Delete', danger: true })
  })

  it('settles the previous dialog when a new one opens', async () => {
    const first = promptDialog({})
    const second = promptDialog({})
    expect(await first).toBeNull()
    close('x')
    expect(await second).toBe('x')
  })
})
