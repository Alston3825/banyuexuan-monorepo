import { http } from '../client'

export interface IntegrationSystem {
  id: string
  code: string
  name: string
  baseUrl: string | null
  systemVersion: string | null
  storeId: string | null
  apiKeyPrefix: string
  enabled: boolean
  lastSeenAt: string | null
  remark: string | null
  createdAt: string
  version: number
}
export interface RoomBinding {
  id: string
  roomId: string
  storeId: string
  kind: 'TABLET' | 'BEACON'
  deviceCode: string
  remark: string | null
  room: { roomNo: string; floor: string }
}
export interface ServiceCodeItem {
  id: string
  serviceCode: string
  name: string
  category: string
  sortNo: number
  status: 'ACTIVE' | 'INACTIVE'
}

export const integrationApi = {
  systems: () => http.get<IntegrationSystem[]>('/integration/systems').then((r) => r.data),
  createSystem: (body: { code: string; name: string; baseUrl?: string; systemVersion?: string; storeId?: string; remark?: string }) =>
    http.post<{ id: string; code: string; apiKey: string }>('/integration/systems', body).then((r) => r.data),
  updateSystem: (id: string, body: Partial<Pick<IntegrationSystem, 'name' | 'baseUrl' | 'systemVersion' | 'storeId' | 'enabled' | 'remark'>>) =>
    http.patch<IntegrationSystem>(`/integration/systems/${id}`, body).then((r) => r.data),
  resetKey: (id: string) => http.post<{ id: string; apiKey: string }>(`/integration/systems/${id}/reset-key`).then((r) => r.data),
  bindings: (params?: { storeId?: string; roomId?: string }) => http.get<RoomBinding[]>('/integration/room-bindings', { params }).then((r) => r.data),
  addBinding: (body: { roomId: string; kind: 'TABLET' | 'BEACON'; deviceCode: string; remark?: string }) =>
    http.post<RoomBinding>('/integration/room-bindings', body).then((r) => r.data),
  removeBinding: (id: string) => http.delete(`/integration/room-bindings/${id}`).then((r) => r.data),
  serviceCodes: () => http.get<ServiceCodeItem[]>('/integration/service-codes').then((r) => r.data),
  upsertServiceCode: (body: { serviceCode: string; name: string; category?: string; sortNo?: number; status?: 'ACTIVE' | 'INACTIVE' }) =>
    http.post<ServiceCodeItem>('/integration/service-codes', body).then((r) => r.data),
}
