import { defineStore } from 'pinia'
import { applyThemeAttr, DEFAULT_THEME, themeOf } from '../themes'

export const useUiStore = defineStore('ui', {
  state: () => ({
    sidebarCollapsed: false,
    /** 当前生效的配色方案 */
    theme: DEFAULT_THEME as string,
    /** 每个账号各自选的配色方案（同一台电脑多人轮流登录时互不影响） */
    themeByAccount: {} as Record<string, string>,
  }),
  actions: {
    toggleSidebar() {
      this.sidebarCollapsed = !this.sidebarCollapsed
    },
    /** 当前登录人选择配色方案 */
    setTheme(key: string, accountId?: string | null) {
      this.theme = themeOf(key).key
      if (accountId) this.themeByAccount[accountId] = this.theme
      applyThemeAttr(this.theme)
    },
    /** 登录后/打开页面时：切到这个账号上次选的方案（没选过就沿用当前的） */
    syncTheme(accountId?: string | null) {
      const saved = accountId ? this.themeByAccount[accountId] : undefined
      this.theme = themeOf(saved ?? this.theme).key
      applyThemeAttr(this.theme)
    },
  },
  persist: true,
})
