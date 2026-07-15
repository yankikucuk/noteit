import { createApp } from 'vue'
import OptionsApp from './OptionsApp.vue'
import { attachVueErrorHandler } from '../shared/toast.js'
import '@fortawesome/fontawesome-free/css/all.min.css'
import '../assets/base.css'
import '../shared/theme.js'

const app = createApp(OptionsApp)
attachVueErrorHandler(app)
app.mount('#app')
