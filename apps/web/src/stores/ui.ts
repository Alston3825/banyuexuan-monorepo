import { defineStore } from 'pinia'
import { applyThemeAttr, DEFAULT_THEME, themeOf } from '../themes'

export const useUiStore = defineStore('ui', {
  state: () => ({
    sidebarCollapsed: false,
    /** 当前生效的配色方案 */
    theme: DEFAULT_THEME as string,
    /** 本机缓存：每个账号选的配色方案（真正的记录在服务器账号上，这里只为打开页面时不闪） */
    themeByAccount: {} as Record<string, string>,
  }),
  actions: {
    toggleSidebar() {
      this.sidebarCollapsed = !this.sidebarCollapsed
    },
    /** 把某个方案设为当前生效，并记到本机缓存 */
    setTheme(key: string, accountId?: string | null) {
      this.theme = themeOf(key).key
      if (accountId) this.themeByAccount[accountId] = this.theme
      applyThemeAttr(this.theme)
    },
    /**
     * 打开页面/登录后：按“服务器上这个账号选的 → 本机缓存 → 系统默认”的顺序决定用哪套。
     * serverTheme 传 undefined 表示还不知道服务器的值（先用缓存）；传 null 表示这个账号从没选过（用默认）。
     */
    syncTheme(accountId?: string | null, serverTheme?: string | null) {
      let key: string
      if (!accountId) key = DEFAULT_THEME
      else if (serverTheme !== undefined) key = serverTheme ?? DEFAULT_THEME
      else key = this.themeByAccount[accountId] ?? DEFAULT_THEME
      this.setTheme(key, accountId)
    },
  },
  persist: true,
})
