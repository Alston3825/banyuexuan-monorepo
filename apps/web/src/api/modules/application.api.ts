import { http } from '../client'
import type { Application, CreateApplicationDto, UpdateApplicationDto } from '../types/application'

export const applicationApi = {
  list: () => http.get<Application[]>('/platform/applications').then((r) => r.data),
  get: (id: string) => http.get<Application>(`/platform/applications/${id}`).then((r) => r.data),
  create: (body: CreateApplicationDto) => http.post<Application>('/platform/applications', body).then((r) => r.data),
  update: (id: string, body: UpdateApplicationDto) =>
    http.patch<Application>(`/platform/applications/${id}`, body).then((r) => r.data),
  remove: (id: string) => http.delete(`/platform/applications/${id}`).then((r) => r.data),
}
