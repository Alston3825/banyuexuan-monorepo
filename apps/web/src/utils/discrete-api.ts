import { createDiscreteApi } from 'naive-ui'
import { computed } from 'vue'
import { themeOf } from '../themes'
import { useUiStore } from '../stores/ui'

/**
 * Naive UI 的 discrete API：让 axios 拦截器这类不在组件树里的普通模块代码
 * 也能弹 message/dialog，不需要挂在某个具体组件上。
 */
export const { message, dialog, notification } = createDiscreteApi(['message', 'dialog', 'notification'], {
  // 弹出的提示/确认框跟随当前配色方案（pinia 还没就绪时退回默认方案）
  configProviderProps: computed(() => {
    try {
      return { themeOverrides: themeOf(useUiStore().theme).overrides }
    } catch {
      return { themeOverrides: themeOf(null).overrides }
    }
  }),
})
