<script setup>
/**
 * DialogHost — singleton mount point for the app's prompt/confirm dialogs. Drop
 * one instance into a window's root component; it renders {@link DialogModal}
 * only while a dialog is active, so the modal (and its focus trap) mounts fresh
 * for each open.
 */
import { activeDialog } from '../shared/dialogs.js'
import DialogModal from './DialogModal.vue'
</script>

<template>
  <DialogModal v-if="activeDialog" />
</template>
