import { http } from '../client'

export type NotificationCategory = 'APPROVAL' | 'APPROVAL_RESULT' | 'CC' | 'URGE' | 'CARE_PLAN' | 'CARE_DAILY' | 'REMINDER' | 'SYSTEM'
export interface NotificationItem {
  id: string
  category: NotificationCategory
  level: 'info' | 'warning' | 'danger' | 'success'
  title: string
  body: string | null
  link: string | null
  readAt: string | null
  createdAt: string
}
export interface NotificationSummary {
  unread: number
  fresh: NotificationItem[]
  latest: NotificationItem[]
  serverTime: string
}

export const NOTIFICATION_CATEGORY_LABEL: Record<NotificationCategory, string> = {
  APPROVAL: '待我审批',
  APPROVAL_RESULT: '审批结果',
  CC: '抄送给我',
  URGE: '催办',
  CARE_PLAN: '护理计划',
  CARE_DAILY: '日常护理记录',
  REMINDER: '个人提醒',
  SYSTEM: '系统消息',
}

export const notificationApi = {
  summary: (since?: string) => http.get<NotificationSummary>('/notifications/summary', { params: { since }, silent403: true } as any).then((r) => r.data),
  list: (params: { unread?: boolean; category?: string; page?: number; pageSize?: number }) =>
    http
      .get<{ items: NotificationItem[]; total: number; page: number; pageSize: number }>('/notifications', { params: { ...params, unread: params.unread ? 1 : undefined } })
      .then((r) => r.data),
  read: (id: string) => http.post<NotificationItem>(`/notifications/${id}/read`).then((r) => r.data),
  readAll: (category?: string) => http.post<{ updated: number }>('/notifications/read-all', { category }).then((r) => r.data),
}

/** 相对时间：刚刚 / 5 分钟前 / 3 小时前 / 11-20 14:05 */
export function timeAgo(iso: string): string {
  const t = new Date(iso).getTime()
  const diff = Date.now() - t
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`
  const d = new Date(t)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
