import { createApp } from 'vue'
import ExplorerApp from './ExplorerApp.vue'
import { attachVueErrorHandler } from '../shared/toast.js'
import '@fortawesome/fontawesome-free/css/all.min.css'
import '../assets/base.css'
import '../shared/theme.js'

const app = createApp(ExplorerApp)
attachVueErrorHandler(app)
app.mount('#app')
