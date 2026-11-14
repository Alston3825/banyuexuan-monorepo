import { http } from '../client'
import type { Lead, CreateLeadDto, UpdateLeadDto, QueryLeadParams } from '../types/lead'
import type { Customer } from '../types/customer'

export const leadApi = {
  list: (params?: QueryLeadParams) => http.get<Lead[]>('/crm/leads', { params }).then((r) => r.data),
  get: (id: string) => http.get<Lead>(`/crm/leads/${id}`).then((r) => r.data),
  create: (body: CreateLeadDto) => http.post<Lead>('/crm/leads', body).then((r) => r.data),
  update: (id: string, body: UpdateLeadDto) => http.patch<Lead>(`/crm/leads/${id}`, body).then((r) => r.data),
  assign: (id: string, assignedToId: string, version: number) =>
    http.post<Lead>(`/crm/leads/${id}/assign`, { assignedToId, version }).then((r) => r.data),
  convert: (id: string, version: number) =>
    http.post<{ lead: Lead; customer: Customer }>(`/crm/leads/${id}/convert`, { version }).then((r) => r.data),
  lose: (id: string, lostReason: string, version: number) =>
    http.post<Lead>(`/crm/leads/${id}/lose`, { lostReason, version }).then((r) => r.data),
}
