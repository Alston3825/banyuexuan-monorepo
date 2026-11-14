import { http } from '../client'
import type { CreateRegionDto, Region, UpdateRegionDto } from '../types/region'

export const regionApi = {
  list: () => http.get<Region[]>('/platform/regions').then((r) => r.data),
  get: (id: string) => http.get<Region>(`/platform/regions/${id}`).then((r) => r.data),
  create: (body: CreateRegionDto) => http.post<Region>('/platform/regions', body).then((r) => r.data),
  update: (id: string, body: UpdateRegionDto) =>
    http.patch<Region>(`/platform/regions/${id}`, body).then((r) => r.data),
  remove: (id: string) => http.delete(`/platform/regions/${id}`).then((r) => r.data),
}
