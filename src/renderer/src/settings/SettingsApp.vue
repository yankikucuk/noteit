<script setup>
/**
 * SettingsApp — root of the settings window. Reads/writes persisted preferences
 * through the settings API — language, theme, launch at login, unfocused-note
 * fade, idle auto-lock, default note color, and the global shortcuts — and
 * offers backup/restore, JSON/Markdown import, data-folder access, and the
 * manual update check.
 */
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { COLOR_ORDER, COLORS } from '../shared/colors'
import IconBtn from '../ui/IconBtn.vue'
import ToggleSwitch from '../ui/ToggleSwitch.vue'
import ShortcutInput from '../ui/ShortcutInput.vue'
import ToastHost from '../ui/ToastHost.vue'
import { pushToast } from '../shared/toast.js'
import { applyTheme } from '../shared/theme.js'
import { t, locale, AVAILABLE_LOCALES } from '../i18n.js'

const launchAtLogin = ref(false)
const fadeUnfocused = ref(false)
const autoLockMinutes = ref(0)
const defaultColor = ref('yellow')
const language = ref('tr')
const theme = ref('system')
const shortcutNewNote = ref('CommandOrControl+Alt+N')
const shortcutExplorer = ref('CommandOrControl+Alt+E')
const appInfo = ref({ version: '', name: 'NoteIt', packaged: false })

/** Maps an update:status code to a toast. */
const UPDATE_TOASTS = {
  checking: () => pushToast(t('update.checking'), 'info'),
  available: () => pushToast(t('update.available'), 'info'),
  none: () => pushToast(t('update.none'), 'info'),
  error: () => pushToast(t('update.checkFailed'), 'error')
}

let unsub = null

onMounted(async () => {
  launchAtLogin.value = !!(await window.api.settings.get('launch_at_login', false))
  fadeUnfocused.value = !!(await window.api.settings.get('fade_unfocused', false))
  autoLockMinutes.value = Number(await window.api.settings.get('auto_lock_minutes', 0)) || 0
  defaultColor.value = await window.api.settings.get('default_note_color', 'yellow')
  language.value = await window.api.settings.get('language', locale.value)
  theme.value = await window.api.settings.get('theme', 'system')
  shortcutNewNote.value = await window.api.settings.get('shortcut_new_note', shortcutNewNote.value)
  shortcutExplorer.value = await window.api.settings.get(
    'shortcut_explorer',
    shortcutExplorer.value
  )
  appInfo.value = await window.api.appInfo.get()
  unsub = window.api.on('update:status', (status) => UPDATE_TOASTS[status]?.())
})

onBeforeUnmount(() => unsub && unsub())

function checkForUpdates() {
  window.api.update.check()
}

async function setLaunch(v) {
  launchAtLogin.value = !!v
  await window.api.settings.set('launch_at_login', !!v)
}
async function setFade(v) {
  fadeUnfocused.value = !!v
  await window.api.settings.set('fade_unfocused', !!v)
}
async function setAutoLock(v) {
  autoLockMinutes.value = Number(v) || 0
  await window.api.settings.set('auto_lock_minutes', autoLockMinutes.value)
}
async function setColor(c) {
  defaultColor.value = c
  await window.api.settings.set('default_note_color', c)
}
async function setLanguage(code) {
  language.value = code
  await window.api.settings.set('language', code)
}
async function setTheme(value) {
  theme.value = value
  applyTheme(value) // instant feedback in this window
  await window.api.settings.set('theme', value)
}
async function setShortcut(key, target, value) {
  target.value = value
  await window.api.settings.set(key, value)
}
async function backup() {
  const r = await window.api.backup.create()
  if (r.ok) pushToast(t('toast.backupCreated'), 'success')
}
function restore() {
  window.api.backup.restore()
}
async function exportData() {
  const r = await window.api.data.export()
  if (r.ok) pushToast(t('toast.exported', { count: r.count }), 'success')
}
async function importData() {
  const r = await window.api.data.import()
  if (r.ok) pushToast(t('toast.imported', { count: r.count }), 'success')
}
async function importMarkdown() {
  const r = await window.api.data.importMarkdown()
  if (r.ok) pushToast(t('toast.imported', { count: r.count }), 'success')
}
function revealData() {
  window.api.appInfo.revealData()
}
function close() {
  window.api.window.close()
}
</script>

<template>
  <div class="settings">
    <header class="topbar drag">
      <div class="title"><i class="fa-solid fa-gear"></i> {{ t('settings.title') }}</div>
      <IconBtn icon="fa-solid fa-xmark" :title="t('settings.close')" @click="close" />
    </header>

    <div class="body no-drag">
      <!-- General -->
      <section>
        <h3>{{ t('settings.general') }}</h3>
        <div class="row">
          <div class="row-label">
            <span>{{ t('settings.language') }}</span>
          </div>
          <select class="lang" :value="language" @change="setLanguage($event.target.value)">
            <option v-for="l in AVAILABLE_LOCALES" :key="l.code" :value="l.code">
              {{ l.label }}
            </option>
          </select>
        </div>
        <div class="row">
          <div class="row-label">
            <span>{{ t('settings.theme') }}</span>
          </div>
          <select class="lang" :value="theme" @change="setTheme($event.target.value)">
            <option value="system">{{ t('theme.system') }}</option>
            <option value="light">{{ t('theme.light') }}</option>
            <option value="dark">{{ t('theme.dark') }}</option>
          </select>
        </div>
        <div class="row">
          <div class="row-label">
            <span>{{ t('settings.launchAtLogin') }}</span>
            <small>{{ t('settings.launchAtLoginDesc') }}</small>
          </div>
          <ToggleSwitch :model-value="launchAtLogin" @update:model-value="setLaunch" />
        </div>
        <div class="row">
          <div class="row-label">
            <span>{{ t('settings.fadeUnfocused') }}</span>
            <small>{{ t('settings.fadeUnfocusedDesc') }}</small>
          </div>
          <ToggleSwitch :model-value="fadeUnfocused" @update:model-value="setFade" />
        </div>
        <div class="row">
          <div class="row-label">
            <span>{{ t('settings.autoLock') }}</span>
            <small>{{ t('settings.autoLockDesc') }}</small>
          </div>
          <select
            class="lang"
            :value="autoLockMinutes"
            @change="setAutoLock(Number($event.target.value))"
          >
            <option :value="0">{{ t('settings.autoLockOff') }}</option>
            <option :value="5">{{ t('settings.autoLockMinutes', { n: 5 }) }}</option>
            <option :value="15">{{ t('settings.autoLockMinutes', { n: 15 }) }}</option>
            <option :value="30">{{ t('settings.autoLockMinutes', { n: 30 }) }}</option>
          </select>
        </div>
        <div class="row col">
          <div class="row-label">
            <span>{{ t('settings.defaultColor') }}</span>
          </div>
          <div class="swatches">
            <button
              v-for="name in COLOR_ORDER"
              :key="name"
              class="swatch"
              :class="{ sel: defaultColor === name }"
              :style="{ background: COLORS[name].bg }"
              :title="t('color.' + name)"
              @click="setColor(name)"
            >
              <i v-if="defaultColor === name" class="fa-solid fa-check"></i>
            </button>
          </div>
        </div>
      </section>

      <!-- Shortcuts -->
      <section>
        <h3>{{ t('settings.shortcuts') }}</h3>
        <div class="row">
          <div class="row-label">
            <span>{{ t('settings.shortcutNewNote') }}</span>
          </div>
          <ShortcutInput
            :model-value="shortcutNewNote"
            @update:model-value="(v) => setShortcut('shortcut_new_note', shortcutNewNote, v)"
          />
        </div>
        <div class="row">
          <div class="row-label">
            <span>{{ t('settings.shortcutExplorer') }}</span>
          </div>
          <ShortcutInput
            :model-value="shortcutExplorer"
            @update:model-value="(v) => setShortcut('shortcut_explorer', shortcutExplorer, v)"
          />
        </div>
      </section>

      <!-- Backup -->
      <section>
        <h3>{{ t('settings.backup') }}</h3>
        <p class="hint">{{ t('settings.backupHint') }}</p>
        <div class="btn-row">
          <button class="btn" @click="backup">
            <i class="fa-solid fa-download"></i> {{ t('settings.createBackup') }}
          </button>
          <button class="btn" @click="restore">
            <i class="fa-solid fa-upload"></i> {{ t('settings.restore') }}
          </button>
          <button class="btn ghost" @click="revealData">
            <i class="fa-solid fa-folder-open"></i> {{ t('settings.dataFolder') }}
          </button>
        </div>
      </section>

      <!-- Notes data (portable JSON) -->
      <section>
        <h3>{{ t('settings.data') }}</h3>
        <p class="hint">{{ t('settings.dataHint') }}</p>
        <div class="btn-row">
          <button class="btn" @click="exportData">
            <i class="fa-solid fa-file-export"></i> {{ t('settings.exportData') }}
          </button>
          <button class="btn" @click="importData">
            <i class="fa-solid fa-file-import"></i> {{ t('settings.importData') }}
          </button>
          <button class="btn ghost" @click="importMarkdown">
            <i class="fa-brands fa-markdown"></i> {{ t('settings.importMarkdown') }}
          </button>
        </div>
      </section>

      <!-- About -->
      <section>
        <h3>{{ t('settings.about') }}</h3>
        <div class="about">
          <i class="fa-solid fa-note-sticky brand"></i>
          <div>
            <strong>{{ appInfo.name }}</strong>
            <small>{{ t('settings.version', { version: appInfo.version || '—' }) }}</small>
          </div>
          <button v-if="appInfo.packaged" class="btn ghost check" @click="checkForUpdates">
            <i class="fa-solid fa-rotate"></i> {{ t('settings.checkUpdates') }}
          </button>
        </div>
      </section>
    </div>
    <ToastHost />
  </div>
</template>

<style scoped>
.settings {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--x-bg);
  color: var(--x-text);
  font-size: 13px;
}
.topbar {
  height: 46px;
  display: flex;
  align-items: center;
  padding: 0 8px 0 14px;
  background: var(--x-surface);
  border-bottom: 1px solid var(--x-border);
}
.title {
  flex: 1;
  font-weight: 650;
  font-size: 14px;
}
.title i {
  color: var(--x-brand);
  margin-right: 6px;
}
.topbar :deep(.icon-btn) {
  color: var(--x-text-dim);
}
.body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 16px 20px;
}
section {
  padding: 14px 0;
  border-bottom: 1px solid var(--x-border);
}
section:last-child {
  border-bottom: none;
}
h3 {
  margin: 0 0 12px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--x-text-dim);
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}
.row.col {
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
}
.row-label {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.row-label span {
  font-weight: 550;
}
.row-label small {
  color: var(--x-text-dim);
  font-size: 11px;
}
.swatches {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 7px;
}
.swatch {
  aspect-ratio: 1;
  border-radius: 50%;
  border: 1.5px solid rgba(0, 0, 0, 0.12);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  color: rgba(0, 0, 0, 0.55);
  transition: transform var(--dur) var(--ease);
}
.swatch:hover {
  transform: scale(1.12);
}
.swatch.sel {
  box-shadow:
    0 0 0 2px var(--x-bg),
    0 0 0 3.5px var(--x-accent);
}
.hint,
.about small {
  color: var(--x-text-dim);
}
.hint {
  font-size: 11.5px;
  margin: 0 0 12px;
  line-height: 1.5;
}
.btn-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.btn {
  border: 1px solid var(--x-border);
  background: var(--x-surface);
  color: var(--x-text);
  padding: 8px 12px;
  border-radius: var(--r-md);
  cursor: pointer;
  font-size: 12px;
  font-weight: 550;
}
.btn i {
  margin-right: 6px;
}
.btn:hover {
  border-color: var(--x-accent);
  color: var(--x-accent);
}
.btn.ghost {
  color: var(--x-text-dim);
}
.about {
  display: flex;
  align-items: center;
  gap: 12px;
}
.about .brand {
  font-size: 26px;
  color: var(--x-brand);
}
.about div {
  display: flex;
  flex-direction: column;
}
.about small {
  font-size: 11.5px;
}
.about .check {
  margin-left: auto;
}
</style>
