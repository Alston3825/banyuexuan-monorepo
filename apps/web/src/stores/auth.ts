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
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    accessToken: null,
    refreshToken: null,
    account: null,
  }),
  getters: {
    isAuthenticated: (state) => !!state.accessToken,
  },
  actions: {
    async login(username: string, password: string) {
      const { data } = await http.post<LoginResponse>('/auth/login', { username, password })
      this.accessToken = data.accessToken
      this.refreshToken = data.refreshToken
      this.account = data.account
    },

    /** 刷新令牌会轮换：旧的立刻失效，必须把新的一起存好。返回新 accessToken 供拦截器重放请求。 */
    async refresh(): Promise<string> {
      if (!this.refreshToken) throw new Error('没有可用的刷新令牌')
      const { data } = await http.post<RefreshResponse>('/auth/refresh', {
        refreshToken: this.refreshToken,
      })
      this.accessToken = data.accessToken
      this.refreshToken = data.refreshToken
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
    },
  },
  persist: true,
})
