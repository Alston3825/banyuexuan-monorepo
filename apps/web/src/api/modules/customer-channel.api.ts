import { http } from '../client'
import type { CustomerChannel, CustomerChannelType } from '../types/customer'

type Status = 'ACTIVE' | 'INACTIVE'

export const customerChannelApi = {
  // 渠道类型
  listTypes: () => http.get<CustomerChannelType[]>('/crm/customer-channel-types').then((r) => r.data),
  createType: (body: { name: string }) => http.post<CustomerChannelType>('/crm/customer-channel-types', body).then((r) => r.data),
  updateType: (id: string, body: { name?: string; status?: Status; sortOrder?: number; version: number }) =>
    http.patch<CustomerChannelType>(`/crm/customer-channel-types/${id}`, body).then((r) => r.data),
  removeType: (id: string) => http.delete(`/crm/customer-channel-types/${id}`).then(() => undefined),

  // 具体渠道
  list: (params?: { typeId?: string; status?: Status }) => http.get<CustomerChannel[]>('/crm/customer-channels', { params }).then((r) => r.data),
  create: (body: { typeId: string; name: string }) => http.post<CustomerChannel>('/crm/customer-channels', body).then((r) => r.data),
  update: (id: string, body: { name?: string; status?: Status; version: number }) =>
    http.patch<CustomerChannel>(`/crm/customer-channels/${id}`, body).then((r) => r.data),
  remove: (id: string) => http.delete(`/crm/customer-channels/${id}`).then(() => undefined),
}
