import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import './style.css'
import App from './App.vue'
import { router } from './router'

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

createApp(App).use(pinia).use(router).mount('#app')

// 发布新版本后，浏览器里的离线缓存（Service Worker）会在后台换成新版，但已经打开的页面还是旧的，
// 以前要手动刷新两次才看到新功能。新版接管页面时自动刷新一次；
// 正在输入内容（光标在输入框里）时不刷新，避免丢掉没保存的内容，下次打开/刷新就是新版。
if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return
    const el = document.activeElement as HTMLElement | null
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
    reloaded = true
    window.location.reload()
  })
}
