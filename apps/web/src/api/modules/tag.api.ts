import { http } from '../client'
import type { BindTagDto, CreateTagDto, Tag, UpdateTagDto } from '../types/tag'

export const tagApi = {
  list: () => http.get<Tag[]>('/platform/tags').then((r) => r.data),
  get: (id: string) => http.get<Tag>(`/platform/tags/${id}`).then((r) => r.data),
  create: (body: CreateTagDto) => http.post<Tag>('/platform/tags', body).then((r) => r.data),
  update: (id: string, body: UpdateTagDto) => http.patch<Tag>(`/platform/tags/${id}`, body).then((r) => r.data),
  remove: (id: string) => http.delete(`/platform/tags/${id}`).then((r) => r.data),
  bind: (id: string, body: BindTagDto) => http.post(`/platform/tags/${id}/bindings`, body).then((r) => r.data),
}
