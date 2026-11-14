import { http } from '../client'
import type { CreatePositionDto, Position, UpdatePositionDto } from '../types/position'

export const positionApi = {
  list: () => http.get<Position[]>('/platform/positions').then((r) => r.data),
  get: (id: string) => http.get<Position>(`/platform/positions/${id}`).then((r) => r.data),
  create: (body: CreatePositionDto) => http.post<Position>('/platform/positions', body).then((r) => r.data),
  update: (id: string, body: UpdatePositionDto) =>
    http.patch<Position>(`/platform/positions/${id}`, body).then((r) => r.data),
  remove: (id: string) => http.delete(`/platform/positions/${id}`).then((r) => r.data),
}
