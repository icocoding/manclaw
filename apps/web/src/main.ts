import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import { syncAccessTokenFromLocation } from './lib/access-token'
import { router } from './router'
import './style.css'

syncAccessTokenFromLocation()

createApp(App).use(createPinia()).use(router).mount('#app')
