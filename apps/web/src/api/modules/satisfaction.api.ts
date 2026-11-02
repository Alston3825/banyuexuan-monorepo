import { http } from '../client'
import type { Survey, SurveyComment, SurveyFilter, SurveyPatch, SurveySpecs, SurveyStats } from '../types/satisfaction'

const clean = (p?: SurveyFilter) => Object.fromEntries(Object.entries(p ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== ''))

export const satisfactionApi = {
  specs: () => http.get<SurveySpecs>('/satisfaction/surveys/specs').then((r) => r.data),
  list: (p?: SurveyFilter) => http.get<Survey[]>('/satisfaction/surveys', { params: clean(p) }).then((r) => r.data),
  get: (id: string) => http.get<Survey>(`/satisfaction/surveys/${id}`).then((r) => r.data),
  /** 上传纸质调查表照片（可多张）；不传照片 = 手工录入 */
  create: (formNo: number, files: File[], customerId?: string) => {
    const f = new FormData()
    f.append('formNo', String(formNo))
    if (customerId) f.append('customerId', customerId)
    files.forEach((file) => f.append('files', file))
    return http.post<Survey>('/satisfaction/surveys', f, { timeout: 180_000 }).then((r) => r.data)
  },
  addFiles: (id: string, files: File[]) => {
    const f = new FormData()
    files.forEach((file) => f.append('files', file))
    return http.post<Survey>(`/satisfaction/surveys/${id}/files`, f, { timeout: 180_000 }).then((r) => r.data)
  },
  update: (id: string, body: SurveyPatch) => http.patch<Survey>(`/satisfaction/surveys/${id}`, body).then((r) => r.data),
  confirm: (id: string) => http.post<Survey>(`/satisfaction/surveys/${id}/confirm`).then((r) => r.data),
  unconfirm: (id: string) => http.post<Survey>(`/satisfaction/surveys/${id}/unconfirm`).then((r) => r.data),
  extract: (id: string) => http.post<Survey>(`/satisfaction/surveys/${id}/extract`).then((r) => r.data),
  remove: (id: string) => http.delete(`/satisfaction/surveys/${id}`).then(() => undefined),
  fileBlob: (id: string, fileId: string) => http.get<Blob>(`/satisfaction/surveys/${id}/files/${fileId}`, { responseType: 'blob' }).then((r) => r.data),
  stats: (p?: SurveyFilter) => http.get<SurveyStats>('/satisfaction/surveys/stats', { params: clean(p) }).then((r) => r.data),
  comments: (p?: SurveyFilter) => http.get<SurveyComment[]>('/satisfaction/surveys/comments', { params: clean(p) }).then((r) => r.data),
  summarize: (p?: SurveyFilter) => http.post<{ content: string; suggestionCount: number; praiseCount: number }>('/satisfaction/surveys/summarize', clean(p), { timeout: 180_000 }).then((r) => r.data),
}
