/**
 * @file Print / PDF rendering.
 *
 * Renders a note's HTML content into a clean, print-friendly document in a
 * hidden window (without the sticky-note chrome), which the caller then prints
 * or exports to PDF.
 */

import { BrowserWindow } from 'electron'
import { writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

/**
 * Wraps a note's content HTML in a minimal print stylesheet.
 * @param {object} note - Note row (uses `content`).
 * @returns {string} A full HTML document.
 */
function renderDocument(note) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; color: #111; margin: 32px; line-height: 1.5; font-size: 13px; }
      h1, h2, h3 { margin: 0.5em 0 0.2em; line-height: 1.25; }
      p { margin: 0.35em 0; }
      pre { background: #f4f4f5; padding: 10px 12px; border-radius: 6px; overflow-x: auto; }
      code { background: #f0f0f1; padding: 0.1em 0.35em; border-radius: 3px; font-size: 0.9em; }
      pre code { background: none; padding: 0; }
      img { max-width: 100%; }
      a { color: #1b6ec2; }
      blockquote { border-left: 3px solid #d0d0d0; margin: 0.4em 0; padding-left: 0.8em; color: #555; }
      hr { border: none; border-top: 1px solid #ddd; margin: 0.8em 0; }
      table { border-collapse: collapse; margin: 0.4em 0; }
      th, td { border: 1px solid #ccc; padding: 4px 8px; text-align: left; }
      ul[data-type='taskList'] { list-style: none; padding-left: 0; }
      ul[data-type='taskList'] li { display: flex; gap: 0.5em; align-items: baseline; }
    </style>
  </head>
  <body>${note.content || ''}</body>
</html>`
}

/**
 * Renders the note in a hidden window and hands its web contents to `fn`, then
 * cleans up. A temporary file is used (not a data URL) so large embedded images
 * do not overflow URL length limits.
 * @param {object} note - Note row.
 * @param {(contents: Electron.WebContents) => Promise<T>} fn - Receives the loaded contents.
 * @returns {Promise<T>} The result of `fn`.
 * @template T
 */
export async function withRenderedNote(note, fn) {
  const tmpFile = join(tmpdir(), `noteit-print-${Date.now()}-${note.id || 0}.html`)
  writeFileSync(tmpFile, renderDocument(note), 'utf8')
  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, javascript: false }
  })
  try {
    await win.loadFile(tmpFile)
    return await fn(win.webContents)
  } finally {
    if (!win.isDestroyed()) win.destroy()
    try {
      rmSync(tmpFile)
    } catch {
      // ignore temp-file cleanup errors
    }
  }
}

/**
 * Opens the system print dialog for a note.
 * @param {object} note - Note row.
 * @returns {Promise<boolean>} True if printing was initiated.
 */
export function printNote(note) {
  return withRenderedNote(
    note,
    (contents) =>
      new Promise((resolve) => {
        contents.print({}, (success) => resolve(success))
      })
  )
}

/**
 * Renders a note to a PDF buffer.
 * @param {object} note - Note row.
 * @returns {Promise<Buffer>} The PDF bytes.
 */
export function noteToPdf(note) {
  return withRenderedNote(note, (contents) => contents.printToPDF({ printBackground: true }))
}
