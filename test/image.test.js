import { describe, it, expect } from 'vitest'
import { firstImageFile } from '../src/renderer/src/shared/image.js'

/** Builds a minimal DataTransfer-like stub. */
function dt({ files = [], items = [] } = {}) {
  return { files, items }
}

/** A DataTransferItem-like stub. */
function item(file) {
  return { kind: 'file', getAsFile: () => file }
}

describe('firstImageFile', () => {
  it('returns null for empty or missing payloads', () => {
    expect(firstImageFile(null)).toBeNull()
    expect(firstImageFile(dt())).toBeNull()
  })

  it('finds an image among files', () => {
    const png = { type: 'image/png', name: 'a.png' }
    expect(firstImageFile(dt({ files: [{ type: 'text/plain' }, png] }))).toBe(png)
  })

  it('finds an image among clipboard items', () => {
    const jpg = { type: 'image/jpeg' }
    const transfer = dt({ items: [item({ type: 'text/html' }), item(jpg)] })
    expect(firstImageFile(transfer)).toBe(jpg)
  })

  it('ignores non-image content', () => {
    expect(firstImageFile(dt({ files: [{ type: 'application/pdf' }] }))).toBeNull()
    expect(firstImageFile(dt({ items: [item({ type: 'text/plain' })] }))).toBeNull()
  })

  it('skips file items that resolve to null', () => {
    const transfer = dt({ items: [{ kind: 'file', getAsFile: () => null }] })
    expect(firstImageFile(transfer)).toBeNull()
  })

  it('only considers items of kind "file"', () => {
    const transfer = dt({ items: [{ kind: 'string', getAsFile: () => ({ type: 'image/png' }) }] })
    expect(firstImageFile(transfer)).toBeNull()
  })
})
