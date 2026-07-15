import { createApp } from 'vue'
import SettingsApp from './SettingsApp.vue'
import { attachVueErrorHandler } from '../shared/toast.js'
import '@fortawesome/fontawesome-free/css/all.min.css'
import '../assets/base.css'
import '../shared/theme.js'

const app = createApp(SettingsApp)
attachVueErrorHandler(app)
app.mount('#app')
