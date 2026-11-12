import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import './style.css'
import './bx-design.css'
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
  // 有弹窗打开、或光标在输入框/按钮上（正在填内容）时不刷新，等用户关掉弹窗/离开后再换新版，避免丢掉没保存的内容
  const busy = () => {
    const el = document.activeElement as HTMLElement | null
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return true
    return !!document.querySelector('.n-modal-container, .n-drawer-container, .n-dialog')
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return
    reloaded = true
    const tryReload = () => {
      if (busy()) return void setTimeout(tryReload, 5000)
      window.location.reload()
    }
    tryReload()
  })
}
