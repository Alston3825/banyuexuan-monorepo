import axios, { AxiosError } from 'axios'
import { useAuthStore } from '../stores/auth'
import { message } from '../utils/discrete-api'
import { getDeviceId } from '../utils/device-id'

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
  timeout: 15000,
})

http.interceptors.request.use((config) => {
  config.headers['X-Device-Id'] = getDeviceId()
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

    // 登录/刷新接口本身返回 401 = 用户名或密码不对（或账号被停用），不是“登录过期”：
    // 不能走静默刷新再整页跳回 /login（那样输入框被清空、错误提示丢失，浏览器还会把保存的管理员账号密码重新填回来）。
    const isAuthCall = /\/auth\/(login|refresh)$/.test(config?.url ?? '')
    if (status === 401 && config && !isAuthCall && !(config as any)._retried) {
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
    // 调用方主动传 { silent403: true }（比如给下拉框填选项的list()调用，见storeApi/accountApi）
    // 表示"这个接口403是预期内的正常降级，不用弹提示吓用户"——跟409/422这些必须让人看到
    // 的错误不一样，403在这类场景下只是"当前账号权限范围小，选项自然就是空的"。
    if (status === 403 && (config as any)?.silent403) {
      return Promise.reject(error)
    }
    if (status === 403) {
      showMessage(() => message.warning(msg ?? '无权限执行该操作'))
    } else if (status === 409) {
      // “数据已被他人修改”：你打开编辑窗口之后，这条数据又被别人（或你在别的页面）改过了，系统不让旧数据覆盖新数据
      const stale = !msg || msg.includes('数据已被他人修改') || msg.includes('数据并发修改')
      showMessage(() => message.error(stale ? '这条数据刚刚被改过（可能是别人，也可能是你在另一个页面）。请点“取消”关掉窗口，刷新页面后再编辑一次' : msg, stale ? { duration: 8000, closable: true } : undefined))
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
