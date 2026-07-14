import { describe, it, expect } from 'vitest'
import { htmlToPlainText, plainTextToRtf } from '../src/shared/exportFormat.js'

describe('htmlToPlainText', () => {
  it('turns block elements into line breaks', () => {
    expect(htmlToPlainText('<p>one</p><p>two</p>')).toBe('one\ntwo')
    expect(htmlToPlainText('<h1>title</h1><div>body</div>')).toBe('title\nbody')
  })

  it('converts <br> to newlines', () => {
    expect(htmlToPlainText('a<br>b<br/>c')).toBe('a\nb\nc')
  })

  it('strips inline tags but keeps their text', () => {
    expect(htmlToPlainText('<p><strong>bold</strong> and <em>italic</em></p>')).toBe(
      'bold and italic'
    )
  })

  it('decodes the common named entities', () => {
    expect(htmlToPlainText('<p>a&nbsp;b &amp; c &lt;x&gt;</p>')).toBe('a b & c <x>')
  })

  it('collapses excess blank lines and trims', () => {
    expect(htmlToPlainText('<p>a</p><p></p><p></p><p>b</p>')).toBe('a\n\nb')
  })

  it('renders list items on their own lines', () => {
    expect(htmlToPlainText('<ul><li>one</li><li>two</li></ul>')).toBe('one\ntwo')
  })
})

describe('plainTextToRtf', () => {
  it('produces a well-formed RTF header', () => {
    expect(plainTextToRtf('hi')).toMatch(/^\{\\rtf1\\ansi/)
    expect(plainTextToRtf('hi')).toMatch(/hi\}$/)
  })

  it('escapes RTF control characters', () => {
    expect(plainTextToRtf('a\\b{c}d')).toContain('a\\\\b\\{c\\}d')
  })

  it('turns newlines into \\par', () => {
    expect(plainTextToRtf('line1\nline2')).toContain('line1\\par\nline2')
  })

  it('round-trips escaping without breaking the document braces', () => {
    const rtf = plainTextToRtf('{}')
    // Opening/closing braces of the document are still balanced.
    const opens = (rtf.match(/(?<!\\)\{/g) || []).length
    const closes = (rtf.match(/(?<!\\)\}/g) || []).length
    expect(opens).toBe(closes)
  })
})
