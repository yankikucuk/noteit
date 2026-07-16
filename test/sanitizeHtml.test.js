import { describe, it, expect } from 'vitest'
import { sanitizeHtml } from '../src/shared/sanitizeHtml.js'

describe('sanitizeHtml', () => {
  it('removes script elements and their content', () => {
    expect(sanitizeHtml('<p>a</p><script>alert(1)</script><p>b</p>')).toBe('<p>a</p><p>b</p>')
    expect(sanitizeHtml('<SCRIPT src="x.js"></SCRIPT>ok')).toBe('ok')
  })

  it('removes self-closing and unpaired dangerous elements', () => {
    expect(sanitizeHtml('<p>a</p><iframe src="https://x.test"/>')).toBe('<p>a</p>')
    expect(sanitizeHtml('<embed src="x"><p>b</p>')).toBe('<p>b</p>')
    expect(sanitizeHtml('<base href="https://evil.test/">text')).toBe('text')
  })

  it('strips inline event handlers in every quoting style', () => {
    expect(sanitizeHtml('<img src="a.png" onerror="alert(1)">')).toBe('<img src="a.png">')
    expect(sanitizeHtml("<div onclick='x()'>t</div>")).toBe('<div>t</div>')
    expect(sanitizeHtml('<div onmouseover=steal()>t</div>')).toBe('<div>t</div>')
  })

  it('strips javascript: and vbscript: URLs', () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>')
    expect(sanitizeHtml("<a href='  vbscript:evil'>x</a>")).toBe('<a>x</a>')
  })

  it('blocks non-image data: URLs but keeps embedded images', () => {
    expect(sanitizeHtml('<a href="data:text/html,<script>x</script>">x</a>')).not.toContain('data:')
    const img = '<img src="data:image/png;base64,iVBOR=" alt="ok">'
    expect(sanitizeHtml(img)).toBe(img)
  })

  it('leaves ordinary rich content untouched', () => {
    const html =
      '<h1>Title</h1><p><strong>bold</strong> <a href="https://a.test">link</a></p>' +
      '<ul><li>item</li></ul><pre><code>code</code></pre>'
    expect(sanitizeHtml(html)).toBe(html)
  })

  it('tolerates nullish input', () => {
    expect(sanitizeHtml(null)).toBe('')
    expect(sanitizeHtml(undefined)).toBe('')
  })
})
