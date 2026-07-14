/**
 * @file Application menu.
 *
 * Even for a tray-resident app, a proper menu is needed so standard editing
 * shortcuts (undo/redo/cut/copy/paste/select-all) work in note editors, and so
 * macOS shows an app menu with Preferences and Quit.
 */

import { Menu, app } from 'electron'
import { is } from '@electron-toolkit/utils'
import { newNote } from './tray.js'
import { openExplorer } from './windows.js'
import { t } from './i18n.js'

/**
 * Builds and installs the application menu in the current language.
 * @param {() => void} onOpenSettings - Opens the settings window.
 */
export function buildApplicationMenu(onOpenSettings) {
  const isMac = process.platform === 'darwin'

  /** @type {import('electron').MenuItemConstructorOptions[]} */
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about', label: t('menu.about') },
              { type: 'separator' },
              { label: t('menu.settings'), accelerator: 'Cmd+,', click: onOpenSettings },
              { type: 'separator' },
              { role: 'hide', label: t('menu.hide') },
              { role: 'hideOthers', label: t('menu.hideOthers') },
              { type: 'separator' },
              { role: 'quit', label: t('menu.quit') }
            ]
          }
        ]
      : []),
    {
      label: t('menu.file'),
      submenu: [
        { label: t('menu.newNote'), accelerator: 'CmdOrCtrl+N', click: () => newNote() },
        { label: t('menu.explorer'), accelerator: 'CmdOrCtrl+E', click: () => openExplorer() },
        ...(isMac
          ? []
          : [
              { type: 'separator' },
              { label: t('menu.settings'), click: onOpenSettings },
              { type: 'separator' },
              { role: 'quit', label: t('menu.quit') }
            ])
      ]
    },
    {
      label: t('menu.edit'),
      submenu: [
        { role: 'undo', label: t('menu.undo') },
        { role: 'redo', label: t('menu.redo') },
        { type: 'separator' },
        { role: 'cut', label: t('menu.cut') },
        { role: 'copy', label: t('menu.copy') },
        { role: 'paste', label: t('menu.paste') },
        { role: 'selectAll', label: t('menu.selectAll') }
      ]
    },
    {
      label: t('menu.view'),
      submenu: [
        { role: 'togglefullscreen', label: t('menu.fullscreen') },
        ...(is.dev ? [{ role: 'toggleDevTools', label: t('menu.devtools') }] : [])
      ]
    },
    { role: 'windowMenu', label: t('menu.window') }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
