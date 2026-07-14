import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Highlight from '@tiptap/extension-highlight'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import { TableKit } from '@tiptap/extension-table'
import { t } from '../i18n.js'

/**
 * Builds the shared TipTap extension set used by every note editor.
 *
 * StarterKit v3 may bundle Link and Underline, so we disable them there and add
 * our own configured instances — this is safe across StarterKit versions.
 * StarterKit already provides the code block and inline code marks. Images
 * (base64 allowed, so pasted/dropped images embed inline) and tables round out
 * the rich-content support.
 *
 * @param {string} [placeholder] - Placeholder text shown when the note is empty.
 * @returns {import('@tiptap/core').Extensions} The extension list.
 */
export function buildExtensions(placeholder = t('editor.placeholder')) {
  return [
    StarterKit.configure({
      underline: false,
      link: false,
      heading: { levels: [1, 2, 3] }
    }),
    Underline,
    Link.configure({ openOnClick: true, autolink: true, defaultProtocol: 'https' }),
    Highlight.configure({ multicolor: true }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Image.configure({ inline: false, allowBase64: true }),
    TableKit.configure({ table: { resizable: false } }),
    Placeholder.configure({ placeholder })
  ]
}
