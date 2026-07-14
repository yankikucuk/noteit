import { createApp } from 'vue'
import NoteApp from './NoteApp.vue'
import { attachVueErrorHandler } from '../shared/toast.js'
import '@fortawesome/fontawesome-free/css/all.min.css'
import '../assets/base.css'

const app = createApp(NoteApp)
attachVueErrorHandler(app)
app.mount('#app')
