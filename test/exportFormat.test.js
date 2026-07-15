import { describe, it, expect } from 'vitest'
import { htmlToPlainText, plainTextToRtf, htmlToMarkdown } from '../src/shared/exportFormat.js'

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

describe('htmlToMarkdown', () => {
  it('converts headings and inline marks', () => {
    expect(
      htmlToMarkdown('<h1>Title</h1><p>a <strong>b</strong> <em>c</em> <code>d</code></p>')
    ).toBe('# Title\n\na **b** *c* `d`')
    expect(htmlToMarkdown('<p><s>gone</s></p>')).toBe('~~gone~~')
  })

  it('converts bullet and ordered lists', () => {
    expect(htmlToMarkdown('<ul><li><p>one</p></li><li><p>two</p></li></ul>')).toBe('- one\n- two')
    expect(htmlToMarkdown('<ol><li><p>a</p></li><li><p>b</p></li></ol>')).toBe('1. a\n2. b')
  })

  it('converts task lists to GFM checkboxes', () => {
    const html =
      '<ul data-type="taskList">' +
      '<li data-type="taskItem" data-checked="true"><label><input type="checkbox"></label><div><p>done</p></div></li>' +
      '<li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>todo</p></div></li>' +
      '</ul>'
    expect(htmlToMarkdown(html)).toBe('- [x] done\n- [ ] todo')
  })

  it('preserves code-block content and indentation', () => {
    expect(htmlToMarkdown('<pre><code>const a = 1\n  indented</code></pre>')).toBe(
      '```\nconst a = 1\n  indented\n```'
    )
  })

  it('converts links, images, blockquotes and rules', () => {
    expect(htmlToMarkdown('<p><a href="https://x.com">link</a></p>')).toBe('[link](https://x.com)')
    expect(htmlToMarkdown('<p><img src="a.png" alt="pic"></p>')).toBe('![pic](a.png)')
    expect(htmlToMarkdown('<blockquote><p>quote</p></blockquote>')).toBe('> quote')
    expect(htmlToMarkdown('<p>a</p><hr><p>b</p>')).toBe('a\n\n---\n\nb')
  })

  it('converts tables to GFM', () => {
    const html =
      '<table><tr><th><p>A</p></th><th><p>B</p></th></tr><tr><td><p>1</p></td><td><p>2</p></td></tr></table>'
    expect(htmlToMarkdown(html)).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |')
  })

  it('decodes entities and handles empty input', () => {
    expect(htmlToMarkdown('<p>a &amp; b &lt;c&gt;</p>')).toBe('a & b <c>')
    expect(htmlToMarkdown('')).toBe('')
  })
})
