<script setup>
/**
 * ProfileMenu — profile switcher and manager. Lists profiles, switches (asking
 * for a password when protected), and creates/renames/sets-password/deletes
 * profiles. A four-view popover: list, new, unlock, settings.
 *
 * @emits switched - A profile switch occurred (parent should refresh).
 * @emits close - Request to close the popover.
 */
import { ref, onMounted } from 'vue'
import { t } from '../i18n.js'
import { promptDialog, confirmDialog } from '../shared/dialogs.js'

const emit = defineEmits(['close', 'switched'])

const profiles = ref([])
const currentId = ref(null)
const view = ref('list') // 'list' | 'new' | 'unlock' | 'settings'
const target = ref(null)
const error = ref('')

const newName = ref('')
const newPassword = ref('')
const unlockPassword = ref('')

// Settings view: `currentPw` authorises password changes and deletion of a
// protected profile; `newPw` is the password to set (empty removes the lock).
const currentPw = ref('')
const newPw = ref('')

async function load() {
  profiles.value = await window.api.profiles.list()
  const cur = await window.api.profiles.current()
  currentId.value = cur?.id
}
onMounted(load)

async function doSwitch(id, pw) {
  const r = await window.api.profiles.switch(id, pw)
  if (r.ok) {
    emit('switched')
    emit('close')
  } else if (r.error === 'wrong-password') {
    error.value = t('profile.wrongPassword')
  } else {
    error.value = t('profile.switchFailed')
  }
}

function selectProfile(p) {
  error.value = ''
  if (p.id === currentId.value) return emit('close')
  if (p.has_password) {
    target.value = p
    unlockPassword.value = ''
    view.value = 'unlock'
    return
  }
  doSwitch(p.id, '')
}

function submitUnlock() {
  doSwitch(target.value.id, unlockPassword.value)
}

async function createProfile() {
  const name = newName.value.trim()
  if (!name) return
  const pw = newPassword.value
  const p = await window.api.profiles.create(name, pw || null)
  newName.value = ''
  newPassword.value = ''
  if (p) doSwitch(p.id, pw)
}

function openSettings(p) {
  target.value = p
  currentPw.value = ''
  newPw.value = ''
  error.value = ''
  view.value = 'settings'
}

async function renameProfile() {
  const name = await promptDialog({ title: t('profile.renamePrompt'), value: target.value.name })
  if (name) {
    await window.api.profiles.rename(target.value.id, name)
    await load()
    target.value = profiles.value.find((p) => p.id === target.value.id)
  }
}

/**
 * Sets, changes, or removes the profile's password. A protected profile
 * requires its current password; an empty new password removes the lock.
 */
async function saveProfilePassword() {
  error.value = ''
  const r = await window.api.profiles.setPassword(
    target.value.id,
    currentPw.value,
    newPw.value || null
  )
  if (!r.ok) {
    error.value =
      r.error === 'wrong-password' ? t('profile.wrongPassword') : t('profile.saveFailed')
    return
  }
  currentPw.value = ''
  newPw.value = ''
  await load()
  view.value = 'list'
}

async function deleteProfile() {
  if (profiles.value.length <= 1) {
    error.value = t('profile.lastCantDelete')
    return
  }
  const ok = await confirmDialog({
    message: t('profile.deleteConfirm', { name: target.value.name }),
    confirmLabel: t('common.delete'),
    danger: true
  })
  if (!ok) return
  const r = await window.api.profiles.remove(target.value.id, currentPw.value)
  if (r.ok) {
    await load()
    view.value = 'list'
    emit('switched')
  } else if (r.error === 'wrong-password') {
    error.value = t('profile.wrongPassword')
  } else if (r.error === 'last') {
    error.value = t('profile.lastCantDelete')
  }
}

function back() {
  view.value = 'list'
  error.value = ''
}
</script>

<template>
  <div class="pm no-drag fade-in" @click.stop>
    <!-- List -->
    <template v-if="view === 'list'">
      <div class="head">{{ t('profile.title') }}</div>
      <div class="rows">
        <div v-for="p in profiles" :key="p.id" class="prow" :class="{ active: p.id === currentId }">
          <button class="pmain" @click="selectProfile(p)">
            <i
              class="fa-solid"
              :class="p.id === currentId ? 'fa-circle-check' : 'fa-circle-user'"
            ></i>
            <span class="pname">{{ p.name }}</span>
            <i v-if="p.has_password" class="fa-solid fa-lock lock"></i>
            <span class="pcount">{{ p.note_count }}</span>
          </button>
          <button class="pgear" :title="t('profile.settings')" @click.stop="openSettings(p)">
            <i class="fa-solid fa-gear"></i>
          </button>
        </div>
      </div>
      <button class="new-btn" @click="view = 'new'">
        <i class="fa-solid fa-plus"></i> {{ t('profile.new') }}
      </button>
    </template>

    <!-- New profile -->
    <template v-else-if="view === 'new'">
      <div class="head">
        <button class="back" @click="back"><i class="fa-solid fa-chevron-left"></i></button>
        {{ t('profile.new') }}
      </div>
      <div class="form">
        <input v-model="newName" :placeholder="t('profile.name')" @keydown.enter="createProfile" />
        <input
          v-model="newPassword"
          type="password"
          :placeholder="t('profile.passwordOptional')"
          @keydown.enter="createProfile"
        />
        <button class="primary" :disabled="!newName.trim()" @click="createProfile">
          {{ t('profile.createAndSwitch') }}
        </button>
      </div>
    </template>

    <!-- Unlock with password -->
    <template v-else-if="view === 'unlock'">
      <div class="head">
        <button class="back" @click="back"><i class="fa-solid fa-chevron-left"></i></button>
        {{ target.name }}
      </div>
      <div class="form">
        <div class="lock-hint"><i class="fa-solid fa-lock"></i> {{ t('profile.locked') }}</div>
        <input
          v-model="unlockPassword"
          type="password"
          :placeholder="t('profile.password')"
          autofocus
          @keydown.enter="submitUnlock"
        />
        <div v-if="error" class="err">{{ error }}</div>
        <button class="primary" @click="submitUnlock">{{ t('profile.unlock') }}</button>
      </div>
    </template>

    <!-- Profile settings -->
    <template v-else-if="view === 'settings'">
      <div class="head">
        <button class="back" @click="back"><i class="fa-solid fa-chevron-left"></i></button>
        {{ target.name }}
      </div>
      <div class="form">
        <button class="row-btn" @click="renameProfile">
          <i class="fa-solid fa-pen"></i> {{ t('profile.rename') }}
        </button>
        <label v-if="target.has_password" class="fld">
          <span>{{ t('profile.currentPassword') }}</span>
          <input v-model="currentPw" type="password" :placeholder="t('profile.currentPassword')" />
        </label>
        <label class="fld">
          <span>{{
            target.has_password ? t('profile.changePassword') : t('profile.setPassword')
          }}</span>
          <input
            v-model="newPw"
            type="password"
            :placeholder="t('profile.newPasswordPlaceholder')"
          />
        </label>
        <button class="primary" @click="saveProfilePassword">
          {{ t('profile.savePassword') }}
        </button>
        <div v-if="error" class="err">{{ error }}</div>
        <button class="row-btn danger" @click="deleteProfile">
          <i class="fa-solid fa-trash"></i> {{ t('profile.delete') }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.pm {
  width: 250px;
  background: var(--x-surface);
  color: var(--x-text);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-pop);
  overflow: hidden;
  font-size: 12.5px;
}
.head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  font-weight: 650;
  font-size: 11px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--x-text-dim);
  border-bottom: 1px solid var(--x-border);
}
.back {
  border: none;
  background: transparent;
  color: var(--x-text-dim);
  cursor: pointer;
  padding: 0;
  font-size: 12px;
}
.rows {
  padding: 5px;
  max-height: 260px;
  overflow-y: auto;
}
.prow {
  display: flex;
  align-items: center;
  border-radius: var(--r-sm);
}
.prow:hover {
  background: var(--hover);
}
.pmain {
  display: flex;
  align-items: center;
  gap: 9px;
  flex: 1;
  border: none;
  background: transparent;
  color: var(--x-text);
  padding: 8px 9px;
  cursor: pointer;
  font-size: 12.5px;
  text-align: left;
  min-width: 0;
}
.pmain > i {
  color: var(--x-text-faint);
  font-size: 14px;
}
.prow.active .pmain > i {
  color: var(--x-brand);
}
.pname {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 550;
}
.lock {
  font-size: 9px;
  color: var(--x-text-faint);
}
.pcount {
  font-size: 10.5px;
  color: var(--x-text-faint);
}
.pgear {
  border: none;
  background: transparent;
  color: var(--x-text-faint);
  cursor: pointer;
  padding: 8px 10px;
  font-size: 12px;
}
.pgear:hover {
  color: var(--x-text);
}
.new-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: none;
  border-top: 1px solid var(--x-border);
  background: transparent;
  color: var(--x-accent);
  padding: 11px 14px;
  cursor: pointer;
  font-size: 12.5px;
  font-weight: 550;
}
.new-btn:hover {
  background: var(--hover);
}
.form {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.form input {
  border: 1px solid var(--x-border);
  border-radius: var(--r-sm);
  padding: 8px 10px;
  font-size: 12.5px;
  outline: none;
  color: var(--x-text);
  background: var(--x-surface-2);
}
.form input:focus {
  border-color: var(--x-accent);
}
.primary {
  border: none;
  background: var(--x-accent);
  color: #fff;
  padding: 9px;
  border-radius: var(--r-sm);
  cursor: pointer;
  font-weight: 600;
  font-size: 12.5px;
}
.primary:disabled {
  opacity: 0.5;
  cursor: default;
}
.row-btn {
  display: flex;
  align-items: center;
  gap: 9px;
  border: 1px solid var(--x-border);
  background: var(--x-surface-2);
  color: var(--x-text);
  padding: 9px 10px;
  border-radius: var(--r-sm);
  cursor: pointer;
  font-size: 12.5px;
  text-align: left;
}
.row-btn:hover {
  border-color: var(--x-text-faint);
}
.row-btn.danger {
  color: #d64545;
}
.row-btn.danger:hover {
  background: rgba(214, 69, 69, 0.08);
  border-color: rgba(214, 69, 69, 0.3);
}
.fld {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.fld > span {
  font-size: 11px;
  color: var(--x-text-dim);
}
.lock-hint {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--x-text-dim);
  font-size: 12px;
}
.err {
  color: #d64545;
  font-size: 11.5px;
}
</style>
