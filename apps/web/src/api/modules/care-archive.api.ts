import { http } from '../client'
import type { CareSummary, PlanBody, PlanVersion, ServiceSummary, StatMetric, StatRow, MedicationAuth, MedicationBody, MedicationSpecs, DailyDay, DailyDays, DailySpecs, SaveDayBody, AssessmentOverview, AssessmentRecord, AssessmentType, CareDocType, CareDocument, FormSpec } from '../types/care-archive'

export interface UploadDocumentMeta {
  docType: CareDocType
  motherProfileId?: string
  babyProfileId?: string
  title?: string
  docDate?: string
  remark?: string
  /** false = 只留档不识别（手工录入后补传原件） */
  autoExtract?: boolean
}

const form = (files: File[], meta?: UploadDocumentMeta) => {
  const f = new FormData()
  files.forEach((file) => f.append('files', file))
  if (meta) {
    Object.entries(meta).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') f.append(k, String(v))
    })
  }
  return f
}

export const careDocumentApi = {
  list: (params: { motherProfileId?: string; babyProfileId?: string; docType?: CareDocType }) =>
    http.get<CareDocument[]>('/care/documents', { params }).then((r) => r.data),
  get: (id: string) => http.get<CareDocument>(`/care/documents/${id}`).then((r) => r.data),
  upload: (files: File[], meta: UploadDocumentMeta) =>
    http.post<CareDocument>('/care/documents', form(files, meta), { timeout: 180_000 }).then((r) => r.data),
  addFiles: (id: string, files: File[]) => http.post<CareDocument>(`/care/documents/${id}/files`, form(files), { timeout: 180_000 }).then((r) => r.data),
  update: (id: string, body: { title?: string | null; docDate?: string | null; remark?: string | null }) =>
    http.patch<CareDocument>(`/care/documents/${id}`, body).then((r) => r.data),
  extract: (id: string) => http.post<CareDocument>(`/care/documents/${id}/extract`).then((r) => r.data),
  remove: (id: string) => http.delete(`/care/documents/${id}`).then(() => undefined),
  fileBlob: (id: string, fileId: string) => http.get<Blob>(`/care/documents/${id}/files/${fileId}`, { responseType: 'blob' }).then((r) => r.data),
}

export const careAssessmentApi = {
  specs: () => http.get<FormSpec[]>('/care/assessments/specs').then((r) => r.data),
  overview: (motherProfileId: string) => http.get<AssessmentOverview>('/care/assessments/overview', { params: { motherProfileId } }).then((r) => r.data),
  create: (type: AssessmentType, body: { profileId: string; documentId?: string; values: Record<string, unknown> }) =>
    http.post<AssessmentRecord>(`/care/assessments/${type}`, body).then((r) => r.data),
  update: (type: AssessmentType, id: string, body: { version: number; documentId?: string | null; values: Record<string, unknown> }) =>
    http.patch<AssessmentRecord>(`/care/assessments/${type}/${id}`, body).then((r) => r.data),
}

export const careDailyApi = {
  specs: () => http.get<DailySpecs>('/care/daily/specs').then((r) => r.data),
  days: (motherProfileId: string) => http.get<DailyDays>('/care/daily/days', { params: { motherProfileId } }).then((r) => r.data),
  day: (motherProfileId: string, date: string) => http.get<DailyDay>('/care/daily/day', { params: { motherProfileId, date } }).then((r) => r.data),
  save: (body: SaveDayBody) => http.put<DailyDay>('/care/daily/day', body).then((r) => r.data),
  pending: (storeId?: string) => http.get<{ motherProfileId: string; customerName: string; roomNo: string | null }[]>('/care/daily/pending', { params: { storeId } }).then((r) => r.data),
}

export const careMedicationApi = {
  specs: () => http.get<MedicationSpecs>('/care/medications/specs').then((r) => r.data),
  list: (params: { motherProfileId?: string; babyProfileId?: string }) => http.get<MedicationAuth[]>('/care/medications', { params }).then((r) => r.data),
  create: (body: MedicationBody) => http.post<MedicationAuth>('/care/medications', body).then((r) => r.data),
  update: (id: string, body: MedicationBody) => http.patch<MedicationAuth>(`/care/medications/${id}`, body).then((r) => r.data),
  stop: (id: string, body: { version: number; note: string }) => http.post<MedicationAuth>(`/care/medications/${id}/stop`, body).then((r) => r.data),
}

export interface PlanStandards {
  reviewIntervalDays: number
  canApprove: boolean
  levels: { code: string; label: string; desc: string; services: { code: string; name: string; subject: string; group: string; freqText: string }[] }[]
}

export const carePlanVersionApi = {
  standards: () => http.get<PlanStandards>('/care/plan-versions/standards').then((r) => r.data),
  list: (motherProfileId: string) => http.get<PlanVersion[]>('/care/plan-versions', { params: { motherProfileId } }).then((r) => r.data),
  due: (storeId?: string) => http.get<{ reviewDue: PlanVersion[]; pending: PlanVersion[] }>('/care/plan-versions/due', { params: { storeId } }).then((r) => r.data),
  create: (body: PlanBody) => http.post<PlanVersion>('/care/plan-versions', body).then((r) => r.data),
  update: (id: string, body: PlanBody) => http.patch<PlanVersion>(`/care/plan-versions/${id}`, body).then((r) => r.data),
  submit: (id: string, version: number) => http.post<PlanVersion>(`/care/plan-versions/${id}/submit`, { version }).then((r) => r.data),
  approve: (id: string, version: number, comment?: string) => http.post<PlanVersion>(`/care/plan-versions/${id}/approve`, { version, comment }).then((r) => r.data),
  reject: (id: string, version: number, comment: string) => http.post<PlanVersion>(`/care/plan-versions/${id}/reject`, { version, comment }).then((r) => r.data),
}

export const careServiceLogApi = {
  summary: (motherProfileId: string) => http.get<ServiceSummary>('/care/service-logs/summary', { params: { motherProfileId } }).then((r) => r.data),
  create: (body: {
    motherProfileId: string
    babyProfileId?: string | null
    serviceCode: string
    doneDate?: string
    doneTime: string
    systolic?: number
    diastolic?: number
    weightKg?: number
    doneByName?: string
    clientSigned?: boolean
    note?: string
  }) =>
    http.post('/care/service-logs', body).then((r) => r.data),
  remove: (id: string) => http.delete(`/care/service-logs/${id}`).then(() => undefined),
}

export const careStatsApi = {
  metrics: () => http.get<StatMetric[]>('/care/stats/metrics').then((r) => r.data),
  query: (params: { metric: string; op: string; value: number; from?: string; to?: string; storeId?: string }) =>
    http.get<{ metric: string; label: string; unit: string; total: number; truncated: boolean; rows: StatRow[] }>('/care/stats/query', { params }).then((r) => r.data),
  summary: (motherProfileId: string) => http.get<CareSummary>(`/care/summary/${motherProfileId}`).then((r) => r.data),
}
