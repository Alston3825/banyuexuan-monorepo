import type { AxiosError } from 'axios'

/** 从接口错误里提取用户可读的提示文案，用于组件内联展示（不依赖全局message toast）。 */
export function extractErrorMessage(error: unknown, fallback = '操作失败，请稍后重试'): string {
  const axiosError = error as AxiosError<{ message?: string | string[] }>
  const raw = axiosError?.response?.data?.message
  if (Array.isArray(raw)) return raw.join('，')
  if (typeof raw === 'string' && raw) return raw
  if (!axiosError?.response) return '网络请求失败，请检查连接'
  return fallback
}
