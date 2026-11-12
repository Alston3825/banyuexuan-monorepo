import { createDiscreteApi } from 'naive-ui'
import { bxThemeOverrides } from '../bx-theme'

/**
 * Naive UI 的 discrete API：让 axios 拦截器这类不在组件树里的普通模块代码
 * 也能弹 message/dialog，不需要挂在某个具体组件上。
 */
export const { message, dialog, notification } = createDiscreteApi(['message', 'dialog', 'notification'], { configProviderProps: { themeOverrides: bxThemeOverrides } })
