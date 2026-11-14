import { http } from '../client'

export interface RecycleBinItem {
  id: string
  entityType: 'CUSTOMER' | 'MOTHER_PROFILE'
  entityId: string
  title: string
  summary: string | null
  reason: string | null
  deletedByName: string | null
  deletedAt: string
  expiresAt: string
}

export const recycleBinApi = {
  list: (entityType?: string) => http.get<RecycleBinItem[]>('/recycle-bin', { params: { entityType } }).then((r) => r.data),
  restore: (id: string) => http.post(`/recycle-bin/${id}/restore`).then((r) => r.data),
  purge: (id: string) => http.delete(`/recycle-bin/${id}`).then(() => undefined),
}
