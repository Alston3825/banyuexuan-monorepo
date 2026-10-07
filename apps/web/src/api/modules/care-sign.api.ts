import axios from 'axios'
import { http } from '../client'

export type SignShift = 'DAY' | 'NIGHT' | 'RELIEF'
export const SIGN_SHIFT_LABEL: Record<SignShift, string> = { DAY: '白班', NIGHT: '夜班', RELIEF: '替班' }

export interface NurseSignature {
  id: string
  shift: SignShift
  nurseAccountId: string
  nurseName: string
  signatureData: string | null
  signedAt: string
  /** 签字之后记录内容又被改过，需要重新签字 */
  stale: boolean
  mine: boolean
}
export interface NurseRating {
  signatureId: string
  nurseAccountId: string
  nurseName: string
  shift: SignShift
  score: number
}
export interface DayConfirmation {
  id: string
  method: 'SIGNATURE' | 'BUTTON'
  satisfaction: number
  nurseRatings: NurseRating[] | null
  comment: string | null
  signatureData: string | null
  confirmedAt: string
  stale: boolean
  riskFlags: string[]
  dwellMs: number
  holdMs: number | null
  ip: string | null
  userAgent: string | null
}
export interface DaySignStatus {
  recordExists: boolean
  signatures: NurseSignature[]
  confirmation: DayConfirmation | null
}
export interface SignOverviewRow {
  date: string
  signatureCount: number
  staleSignatures: number
  confirmation: 'NONE' | 'CONFIRMED' | 'STALE'
  satisfaction: number | null
  confirmMethod: 'SIGNATURE' | 'BUTTON' | null
}
export interface ConfirmLinkRow {
  id: string
  createdAt: string
  expiresAt: string
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'LOCKED'
  openCount: number
  lastOpenedAt: string | null
}

export const mySignatureApi = {
  get: () => http.get<{ hasSignature: boolean; signatureData: string | null; updatedAt: string | null }>('/me/signature').then((r) => r.data),
  set: (signatureData: string) => http.put<{ hasSignature: boolean; signatureData: string | null }>('/me/signature', { signatureData }).then((r) => r.data),
}

export const careSignApi = {
  overview: (motherProfileId: string) => http.get<SignOverviewRow[]>('/care/daily/sign-overview', { params: { motherProfileId } }).then((r) => r.data),
  status: (motherProfileId: string, date: string) => http.get<DaySignStatus>('/care/daily/signatures', { params: { motherProfileId, date } }).then((r) => r.data),
  sign: (motherProfileId: string, date: string, shift: SignShift) => http.post<DaySignStatus>('/care/daily/signatures', { motherProfileId, date, shift }).then((r) => r.data),
  unsign: (id: string) => http.delete(`/care/daily/signatures/${id}`).then(() => undefined),
  createLink: (motherProfileId: string) => http.post<{ id: string; token: string; path: string; expiresAt: string }>('/care/daily/confirm-links', { motherProfileId }).then((r) => r.data),
  links: (motherProfileId: string) => http.get<ConfirmLinkRow[]>('/care/daily/confirm-links', { params: { motherProfileId } }).then((r) => r.data),
  revokeLink: (id: string) => http.delete(`/care/daily/confirm-links/${id}`).then(() => undefined),
}

// ---------------- 客户确认页（不登录；后期小程序复用同一套接口） ----------------
export interface ReportSummaryGroup {
  title: string
  items: { label: string; value: string }[]
}
export interface ReportDay {
  date: string
  stayDay: number | null
  summary: {
    mother: ReportSummaryGroup[]
    babies: { title: string; groups: ReportSummaryGroup[]; feeding: Record<string, string> | null }[]
  }
  nurses: { signatureId: string; name: string; shift: SignShift }[]
  services: { name: string; time: string | null; baby: string | null; by: string | null }[]
  status: 'NONE' | 'CONFIRMED' | 'STALE'
  confirmedAt: string | null
  satisfaction: number | null
  nurseRatings: NurseRating[] | null
}
export interface ReportPayload {
  customerName: string
  storeName: string
  roomNo: string | null
  windowDays: number
  holdMinMs: number
  minViewMs: number
  days: ReportDay[]
  viewToken: string
}

const pub = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api/v1', timeout: 20000 })

/** 把接口报错整理成一句人话（不走全局 toast，页面自己显示） */
export function publicErrorText(e: unknown): string {
  const err = e as { response?: { status?: number; data?: { message?: string | string[] } }; message?: string }
  const raw = err.response?.data?.message
  const msg = Array.isArray(raw) ? raw.join('，') : raw
  if (msg) return msg
  if (!err.response) return '网络不通，请检查手机网络后重试'
  return `出错了（${err.response.status}），请稍后再试`
}

export const publicConfirmApi = {
  info: (token: string) => pub.get<{ customerName: string; storeName: string; expiresAt: string; locked: boolean; lockedUntil: string | null }>(`/public/care-confirm/${token}/info`).then((r) => r.data),
  verify: (token: string, phoneLast4: string) => pub.post<{ session: string }>(`/public/care-confirm/${token}/verify`, { phoneLast4 }).then((r) => r.data),
  days: (token: string, session: string) => pub.get<ReportPayload>(`/public/care-confirm/${token}/days`, { headers: { 'X-Confirm-Session': session } }).then((r) => r.data),
  confirm: (
    token: string,
    session: string,
    body: {
      viewToken: string
      items: { date: string; satisfaction: number; comment?: string; nurseRatings?: { signatureId: string; score: number }[] }[]
      method: 'SIGNATURE' | 'BUTTON'
      signatureData?: string
      holdMs?: number
      deviceId: string
      acknowledged: boolean
    },
  ) => pub.post<{ confirmed: string[]; batchId: string }>(`/public/care-confirm/${token}/confirm`, body, { headers: { 'X-Confirm-Session': session } }).then((r) => r.data),
}
