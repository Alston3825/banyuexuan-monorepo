import axios from 'axios'
import { http } from '../client'
import type { GrowthReport } from '../types/care-growth'
import { publicErrorText } from './care-sign.api'

const pub = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api/v1', timeout: 20000 })

export const careGrowthApi = {
  report: (babyId: string) => http.get<GrowthReport>(`/care/growth/baby/${babyId}`).then((r) => r.data),
  addRecord: (body: { babyProfileId: string; measuredAt: string; weightKg?: number | null; lengthCm?: number | null; headCm?: number | null; note?: string | null }) =>
    http.post('/care/growth/records', body).then((r) => r.data),
  removeRecord: (id: string) => http.delete(`/care/growth/records/${id}`).then(() => undefined),
  share: (babyId: string) => http.post<{ id: string; token: string; path: string; expiresAt: string }>(`/care/growth/baby/${babyId}/share`).then((r) => r.data),
  revoke: (babyId: string) => http.post<{ revoked: number }>(`/care/growth/baby/${babyId}/share/revoke`).then((r) => r.data),
}

/** 客户打开链接用（不登录） */
export const publicGrowthApi = {
  report: (token: string) => pub.get<GrowthReport>(`/public/growth/${token}`).then((r) => r.data),
  errorText: publicErrorText,
}
