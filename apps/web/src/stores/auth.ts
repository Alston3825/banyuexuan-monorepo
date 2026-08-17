import { defineStore } from 'pinia'
import { http } from '../api/client'
import type { LoginResponse, RefreshResponse } from '../api/types/auth'

interface AuthAccount {
  id: string
  username: string
  realName: string
}

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  account: AuthAccount | null
  /** 该账号拥有的权限点code列表（登录/静默刷新时下发），决定导航菜单显示哪些模块。
   *  前端只用它做"看不到"的体验优化，真正的鉴权由后端 PermissionGuard 兜底，
   *  即使这里算错了也不会导致越权访问。 */
  permissions: string[]
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    accessToken: null,
    refreshToken: null,
    account: null,
    permissions: [],
  }),
  getters: {
    isAuthenticated: (state) => !!state.accessToken,
    /** 是否拥有某个权限点，或该权限点下的任意子权限（如传 'care' 命中 'care.profile'）。
     *  权限目录见 apps/api/prisma/seed.ts 的 permSpecs——MODULE级code本身(如'care')
     *  也会被直接授予，所以精确匹配和前缀匹配都要判断。 */
    hasAccess: (state) => (code: string) => state.permissions.some((p) => p === code || p.startsWith(`${code}.`)),
  },
  actions: {
    async login(username: string, password: string) {
      const { data } = await http.post<LoginResponse>('/auth/login', { username, password })
      this.accessToken = data.accessToken
      this.refreshToken = data.refreshToken
      this.account = data.account
      this.permissions = data.permissions
    },

    /** 刷新令牌会轮换：旧的立刻失效，必须把新的一起存好。返回新 accessToken 供拦截器重放请求。 */
    async refresh(): Promise<string> {
      if (!this.refreshToken) throw new Error('没有可用的刷新令牌')
      const { data } = await http.post<RefreshResponse>('/auth/refresh', {
        refreshToken: this.refreshToken,
      })
      this.accessToken = data.accessToken
      this.refreshToken = data.refreshToken
      this.permissions = data.permissions
      return data.accessToken
    },

    /** silent = true 时跳过调用后端登出接口（用于刷新令牌已经失效的场景，调了也没意义）。 */
    async logout(silent = false) {
      if (!silent && this.refreshToken) {
        try {
          await http.post('/auth/logout', { refreshToken: this.refreshToken })
        } catch {
          // 登出接口失败也要继续清本地状态，不能让用户卡住退不出去
        }
      }
      this.accessToken = null
      this.refreshToken = null
      this.account = null
      this.permissions = []
    },
  },
  persist: true,
})
