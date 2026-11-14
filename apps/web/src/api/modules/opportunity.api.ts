import { http } from '../client'
import type { SalesOpportunity, CreateOpportunityDto, UpdateOpportunityDto, QueryOpportunityParams } from '../types/opportunity'

export const opportunityApi = {
  list: (params?: QueryOpportunityParams) =>
    http.get<SalesOpportunity[]>('/crm/opportunities', { params }).then((r) => r.data),
  get: (id: string) => http.get<SalesOpportunity>(`/crm/opportunities/${id}`).then((r) => r.data),
  create: (body: CreateOpportunityDto) => http.post<SalesOpportunity>('/crm/opportunities', body).then((r) => r.data),
  update: (id: string, body: UpdateOpportunityDto) =>
    http.patch<SalesOpportunity>(`/crm/opportunities/${id}`, body).then((r) => r.data),
  advanceStage: (id: string, targetStage: 'QUOTED' | 'WON', version: number) =>
    http
      .post<SalesOpportunity>(`/crm/opportunities/${id}/advance-stage`, { targetStage, version })
      .then((r) => r.data),
  lose: (id: string, lostReason: string, version: number) =>
    http.post<SalesOpportunity>(`/crm/opportunities/${id}/lose`, { lostReason, version }).then((r) => r.data),
}
