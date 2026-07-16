/**
 * @file Preload bridge.
 *
 * Runs in an isolated context and exposes a minimal, explicit `window.api`
 * surface to the renderer via `contextBridge`. The renderer has no direct
 * access to Node or Electron internals — it can only call the invoke channels
 * listed here and subscribe to the whitelisted events in {@link ALLOWED_EVENTS}.
 */

import { contextBridge, ipcRenderer } from 'electron'

/** Main-process events the renderer is allowed to subscribe to. */
const ALLOWED_EVENTS = [
  'note:updated',
  'note:alarm-fired',
  'note:alarm-changed',
  'note:open-alarm',
  'note:open-history',
  'note:start-pomodoro',
  'explorer:refresh',
  'locale:changed',
  'update:status',
  'theme:changed'
]

/** The API object exposed to the renderer as `window.api`. */
const api = {
  notes: {
    get: (id) => ipcRenderer.invoke('note:get', id),
    create: (overrides) => ipcRenderer.invoke('note:create', overrides),
    update: (id, fields) => ipcRenderer.invoke('note:update', id, fields),
    previewOpacity: (id, value) => ipcRenderer.invoke('note:preview-opacity', id, value),
    trash: (id) => ipcRenderer.invoke('note:trash', id),
    restore: (id) => ipcRenderer.invoke('note:restore', id),
    deleteForever: (id) => ipcRenderer.invoke('note:delete-forever', id),
    duplicate: (id) => ipcRenderer.invoke('note:duplicate', id),
    merge: (ids) => ipcRenderer.invoke('note:merge', ids),
    listVisible: () => ipcRenderer.invoke('notes:visible'),
    listActive: () => ipcRenderer.invoke('notes:active'),
    listTrashed: () => ipcRenderer.invoke('notes:trashed'),
    listArchived: () => ipcRenderer.invoke('notes:archived'),
    archive: (id) => ipcRenderer.invoke('note:archive', id),
    unarchive: (id) => ipcRenderer.invoke('note:unarchive', id),
    bulk: (ids, action, value) => ipcRenderer.invoke('notes:bulk', ids, action, value),
    search: (q) => ipcRenderer.invoke('notes:search', q),
    searchGlobal: (q) => ipcRenderer.invoke('notes:search-global', q),
    open: (id) => ipcRenderer.invoke('note:open', id),
    export: (id, format) => ipcRenderer.invoke('note:export', id, format),
    copyMarkdown: (id) => ipcRenderer.invoke('note:copy-markdown', id),
    copyLink: (id) => ipcRenderer.invoke('note:copy-link', id),
    exportPng: (id) => ipcRenderer.invoke('note:export-png', id),
    exportPdf: (id) => ipcRenderer.invoke('note:export-pdf', id),
    print: (id) => ipcRenderer.invoke('note:print', id),
    addTag: (noteId, tagId) => ipcRenderer.invoke('note:add-tag', noteId, tagId),
    removeTag: (noteId, tagId) => ipcRenderer.invoke('note:remove-tag', noteId, tagId),
    lockAll: (locked) => ipcRenderer.invoke('notes:lock-all', locked),
    versions: (noteId) => ipcRenderer.invoke('note:versions', noteId),
    restoreVersion: (noteId, versionId) =>
      ipcRenderer.invoke('note:restore-version', noteId, versionId)
  },
  tags: {
    list: () => ipcRenderer.invoke('tags:list'),
    create: (name, color) => ipcRenderer.invoke('tag:create', name, color),
    remove: (id) => ipcRenderer.invoke('tag:delete', id)
  },
  profiles: {
    list: () => ipcRenderer.invoke('profiles:list'),
    current: () => ipcRenderer.invoke('profile:current'),
    create: (name, password) => ipcRenderer.invoke('profile:create', name, password),
    rename: (id, name) => ipcRenderer.invoke('profile:rename', id, name),
    setPassword: (id, currentPassword, newPassword) =>
      ipcRenderer.invoke('profile:set-password', id, currentPassword, newPassword),
    switch: (id, password) => ipcRenderer.invoke('profile:switch', id, password),
    remove: (id, password) => ipcRenderer.invoke('profile:delete', id, password)
  },
  trash: {
    empty: () => ipcRenderer.invoke('trash:empty')
  },
  notebooks: {
    list: () => ipcRenderer.invoke('notebooks:list'),
    create: (name) => ipcRenderer.invoke('notebook:create', name),
    rename: (id, name) => ipcRenderer.invoke('notebook:rename', id, name),
    remove: (id) => ipcRenderer.invoke('notebook:delete', id)
  },
  alarms: {
    get: (noteId) => ipcRenderer.invoke('alarm:get', noteId),
    set: (noteId, triggerAt, repeatMode) =>
      ipcRenderer.invoke('alarm:set', noteId, triggerAt, repeatMode),
    clear: (noteId) => ipcRenderer.invoke('alarm:clear', noteId),
    snooze: (noteId, triggerAt) => ipcRenderer.invoke('alarm:snooze', noteId, triggerAt),
    upcoming: () => ipcRenderer.invoke('alarms:upcoming')
  },
  backup: {
    create: () => ipcRenderer.invoke('backup:create'),
    restore: () => ipcRenderer.invoke('backup:restore')
  },
  data: {
    export: () => ipcRenderer.invoke('data:export'),
    import: () => ipcRenderer.invoke('data:import'),
    importMarkdown: () => ipcRenderer.invoke('data:import-markdown')
  },
  settings: {
    get: (key, fallback) => ipcRenderer.invoke('settings:get', key, fallback),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
    open: () => ipcRenderer.invoke('settings:open')
  },
  filters: {
    list: () => ipcRenderer.invoke('filters:list'),
    save: (filters) => ipcRenderer.invoke('filters:save', filters)
  },
  locale: {
    current: () => ipcRenderer.invoke('locale:current')
  },
  appInfo: {
    get: () => ipcRenderer.invoke('app:info'),
    revealData: () => ipcRenderer.invoke('app:reveal-data')
  },
  update: {
    check: () => ipcRenderer.invoke('update:check')
  },
  explorer: {
    open: () => ipcRenderer.invoke('explorer:open')
  },
  options: {
    open: (noteId, anchor) => ipcRenderer.invoke('options:open', noteId, anchor),
    close: () => ipcRenderer.invoke('options:close'),
    resize: (w, h) => ipcRenderer.invoke('options:resize', w, h),
    action: (action, noteId) => ipcRenderer.invoke('options:action', action, noteId)
  },
  window: {
    noteClose: (id) => ipcRenderer.invoke('win:note-close', id),
    close: () => ipcRenderer.send('win:close')
  },

  /**
   * Subscribes to a whitelisted main-process event.
   * @param {string} channel - One of {@link ALLOWED_EVENTS}.
   * @param {(...args: any[]) => void} cb - Listener.
   * @returns {() => void} Unsubscribe function.
   */
  on(channel, cb) {
    if (!ALLOWED_EVENTS.includes(channel)) return () => {}
    const listener = (_e, ...args) => cb(...args)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  window.api = api
}
