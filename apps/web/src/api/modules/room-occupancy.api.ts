import { http } from '../client'
import type { RoomOccupancy, CreateRoomOccupancyDto, QueryRoomOccupancyParams } from '../types/room-occupancy'

export const roomOccupancyApi = {
  list: (params?: QueryRoomOccupancyParams) => http.get<RoomOccupancy[]>('/room/occupancies', { params }).then((r) => r.data),
  get: (id: string) => http.get<RoomOccupancy>(`/room/occupancies/${id}`).then((r) => r.data),
  create: (body: CreateRoomOccupancyDto) => http.post<RoomOccupancy>('/room/occupancies', body).then((r) => r.data),
  checkIn: (id: string, version: number) =>
    http.post<RoomOccupancy>(`/room/occupancies/${id}/check-in`, { version }).then((r) => r.data),
  checkOut: (id: string, version: number) =>
    http.post<RoomOccupancy>(`/room/occupancies/${id}/check-out`, { version }).then((r) => r.data),
  cancel: (id: string, cancelReason: string, version: number) =>
    http.post<RoomOccupancy>(`/room/occupancies/${id}/cancel`, { cancelReason, version }).then((r) => r.data),
}
