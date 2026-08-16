import axios, { AxiosError } from 'axios'
import { useAuthStore } from '../stores/auth'
import { message } from '../utils/discrete-api'

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
  timeout: 15000,
})

http.interceptors.request.use((config) => {
  const auth = useAuthStore()
  if (auth.accessToken) {
    config.headers.Authorization = `Bearer ${auth.accessToken}`
  }
  return config
})

// 多个请求同时 401 时，让它们共用同一次刷新，不要各刷各的。
let refreshPromise: Promise<string> | null = null

http.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<{ message?: string | string[] }>) => {
    const { config, response } = error
    const status = response?.status

    if (status === 401 && config && !(config as any)._retried) {
      ;(config as any)._retried = true
      const auth = useAuthStore()
      try {
        if (!refreshPromise) refreshPromise = auth.refresh()
        const newToken = await refreshPromise
        refreshPromise = null
        config.headers.Authorization = `Bearer ${newToken}`
        return http(config)
      } catch {
        refreshPromise = null
        await auth.logout(true)
        window.location.href = '/login'
        return Promise.reject(error)
      }
    }

    const rawMsg = response?.data?.message
    const msg = Array.isArray(rawMsg) ? rawMsg.join(', ') : rawMsg
    // 从这个拦截器的 rejected-promise 链条里直接调用 discrete message API 经实测会静默
    // 不渲染（DOM里最终0个.n-message节点，但message.xxx()确实被调用了）——跟组件异步函数
    // await之后调用discrete API失败是同一类问题（AiCustomerServicePanel等组件也踩过）。
    // 用 setTimeout 把调用挪到当前微任务/错误处理流程之外的下一个宏任务里能稳定绕开。
    const showMessage = (fn: () => void) => setTimeout(fn, 200)
    if (status === 403) {
      showMessage(() => message.warning(msg ?? '无权限执行该操作'))
    } else if (status === 409) {
      showMessage(() => message.error(msg ?? '数据已被他人修改，请刷新页面后重试'))
    } else if (status === 422 || status === 400) {
      showMessage(() => message.error(msg ?? '请求参数有误'))
    } else if (status && status >= 500) {
      showMessage(() => message.error('服务器错误，请稍后重试'))
    } else if (!response) {
      showMessage(() => message.error('网络请求失败，请检查连接'))
    }
    return Promise.reject(error)
  },
)
