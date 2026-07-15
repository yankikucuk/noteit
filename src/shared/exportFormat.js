/**
 * @file Note export formatting.
 *
 * Pure conversions used when exporting a note: rich HTML to plain text, to
 * Markdown, and plain text to a minimal RTF document. Dependency-free (no DOM)
 * so they are unit-testable in isolation and usable in the main process.
 */

/** Decodes the common named HTML entities. */
function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Removes all HTML tags from a fragment. */
function stripTags(s) {
  return s.replace(/<[^>]+>/g, '')
}

/**
 * Converts the inline HTML of a single block (marks and links) to Markdown.
 * Remaining tags (underline, highlight, spans) are dropped. Entities are left
 * encoded here and decoded once at the very end, so text that decodes to `<x>`
 * is not mistaken for a tag and stripped.
 * @param {string} s - Inline HTML fragment.
 * @returns {string} Inline Markdown (entities still encoded).
 */
function inlineToMarkdown(s) {
  return s
    .replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, '**$2**')
    .replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, '*$2*')
    .replace(/<(s|strike|del)>([\s\S]*?)<\/\1>/gi, '~~$2~~')
    .replace(/<code>([\s\S]*?)<\/code>/gi, (_, c) => '`' + stripTags(c) + '`')
    .replace(
      /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
      (_, href, txt) => `[${stripTags(txt)}](${href})`
    )
    .replace(/<br\s*\/?>/gi, '  \n')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

/** Converts a `<table>` inner HTML to a GFM table. */
function tableToMarkdown(inner) {
  const rows = [...inner.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) =>
    [...r[1].matchAll(/<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi)].map(
      (c) => inlineToMarkdown(c[2]).replace(/\|/g, '\\|') || ' '
    )
  )
  if (!rows.length) return ''
  const sep = `| ${Array(rows[0].length).fill('---').join(' | ')} |`
  const line = (cells) => `| ${cells.join(' | ')} |`
  return '\n\n' + [line(rows[0]), sep, ...rows.slice(1).map(line)].join('\n') + '\n\n'
}

/**
 * Converts note HTML (as produced by the TipTap editor) to Markdown, covering
 * headings, bold/italic/strike, inline code, code blocks, links, images,
 * blockquotes, bullet/ordered/task lists, tables and horizontal rules.
 * @param {string} html - Note HTML content.
 * @returns {string} Markdown.
 */
export function htmlToMarkdown(html) {
  let s = String(html).replace(/\r\n?/g, '\n')

  // Pull fenced code blocks out first and protect them with placeholder tokens
  // so the later whitespace normalisation never touches their indentation.
  const codeBlocks = []
  s = s.replace(/<pre[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi, (_, code) => {
    codeBlocks.push('```\n' + decodeEntities(stripTags(code)).replace(/\n+$/, '') + '\n```')
    return `\n\n@@CB${codeBlocks.length - 1}@@\n\n`
  })

  s = s.replace(/<hr\s*\/?>/gi, '\n\n---\n\n')
  s = s.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = (tag.match(/\bsrc="([^"]*)"/i) || [])[1] || ''
    const alt = (tag.match(/\balt="([^"]*)"/i) || [])[1] || ''
    return `![${alt}](${src})`
  })

  s = s.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, c) => `\n\n# ${inlineToMarkdown(c)}\n\n`)
  s = s.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, c) => `\n\n## ${inlineToMarkdown(c)}\n\n`)
  s = s.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, c) => `\n\n### ${inlineToMarkdown(c)}\n\n`)

  s = s.replace(
    /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi,
    (_, c) =>
      '\n\n' +
      inlineToMarkdown(c.replace(/<\/p>/gi, '\n'))
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => `> ${l}`)
        .join('\n') +
      '\n\n'
  )

  // Checklist items (order matters: before the generic list handling).
  s = s.replace(
    /<li[^>]*data-checked="true"[^>]*>([\s\S]*?)<\/li>/gi,
    (_, c) => `- [x] ${inlineToMarkdown(c)}\n`
  )
  s = s.replace(
    /<li[^>]*data-checked="false"[^>]*>([\s\S]*?)<\/li>/gi,
    (_, c) => `- [ ] ${inlineToMarkdown(c)}\n`
  )

  s = s.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner) => {
    let n = 0
    return (
      '\n' +
      inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, c) => `${++n}. ${inlineToMarkdown(c)}\n`) +
      '\n'
    )
  })
  s = s.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, inner) => {
    return (
      '\n' +
      inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, c) => `- ${inlineToMarkdown(c)}\n`) +
      '\n'
    )
  })

  s = s.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, inner) => tableToMarkdown(inner))
  s = s.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, c) => `\n\n${inlineToMarkdown(c)}\n\n`)

  // Any leftover inline markup at the top level, then decode entities once (last,
  // so decoded `<x>` text is never re-stripped as a tag).
  s = inlineToMarkdown(s)
  s = decodeEntities(s)
  s = s
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/gm, '')
    .trim()

  // Restore the protected code blocks.
  return s.replace(/@@CB(\d+)@@/g, (_, i) => codeBlocks[Number(i)])
}

/**
 * Strips HTML to plain text for TXT/RTF export. Block-level tags become line
 * breaks and the common named entities are decoded.
 * @param {string} html - Note HTML content.
 * @returns {string} Plain text.
 */
export function htmlToPlainText(html) {
  return String(html)
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Wraps plain text in a minimal RTF document, escaping the RTF control
 * characters and turning newlines into `\par`.
 * @param {string} text - Plain text.
 * @returns {string} RTF document.
 */
export function plainTextToRtf(text) {
  const escaped = String(text)
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\n/g, '\\par\n')
  return `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Segoe UI;}}\\f0\\fs22 ${escaped}}`
}
