import { http } from '../client'
import type { CreateParameterDto, Parameter, UpdateParameterDto } from '../types/parameter'

export const parameterApi = {
  list: () => http.get<Parameter[]>('/platform/parameters').then((r) => r.data),
  get: (id: string) => http.get<Parameter>(`/platform/parameters/${id}`).then((r) => r.data),
  create: (body: CreateParameterDto) => http.post<Parameter>('/platform/parameters', body).then((r) => r.data),
  update: (id: string, body: UpdateParameterDto) =>
    http.patch<Parameter>(`/platform/parameters/${id}`, body).then((r) => r.data),
  remove: (id: string) => http.delete(`/platform/parameters/${id}`).then((r) => r.data),
}
