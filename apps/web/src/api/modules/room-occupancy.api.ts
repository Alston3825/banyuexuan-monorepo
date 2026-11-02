import { http } from '../client'
import type { RoomOccupancy, CreateRoomOccupancyDto, QueryRoomOccupancyParams, RoomConflict, FreeRoom, WithConflicts, CheckInRoom, CheckInBody } from '../types/room-occupancy'

export const roomOccupancyApi = {
  list: (params?: QueryRoomOccupancyParams) => http.get<RoomOccupancy[]>('/room/occupancies', { params }).then((r) => r.data),
  get: (id: string) => http.get<RoomOccupancy>(`/room/occupancies/${id}`).then((r) => r.data),
  create: (body: CreateRoomOccupancyDto) => http.post<WithConflicts<RoomOccupancy>>('/room/occupancies', body).then((r) => r.data),
  /** 预订冲突清单 */
  conflicts: (storeId?: string) => http.get<RoomConflict[]>('/room/occupancies/conflicts', { params: { storeId } }).then((r) => r.data),
  /** 这条预订能换到的空房（同房型排前面） */
  freeRooms: (id: string) => http.get<FreeRoom[]>(`/room/occupancies/${id}/free-rooms`).then((r) => r.data),
  changeRoom: (id: string, roomId: string, version: number) =>
    http.post<RoomOccupancy>(`/room/occupancies/${id}/change-room`, { roomId, version }).then((r) => r.data),
  /** 办理入住：可改实际房间、入住日期、离店日期（预订只是预计） */
  checkIn: (id: string, version: number, body: CheckInBody = {}) =>
    http.post<WithConflicts<RoomOccupancy>>(`/room/occupancies/${id}/check-in`, { version, ...body }).then((r) => r.data),
  checkInRooms: (id: string, from?: string, to?: string) => http.get<CheckInRoom[]>(`/room/occupancies/${id}/checkin-rooms`, { params: { from, to } }).then((r) => r.data),
  checkOut: (id: string, version: number) =>
    http.post<RoomOccupancy>(`/room/occupancies/${id}/check-out`, { version }).then((r) => r.data),
  cancel: (id: string, cancelReason: string, version: number) =>
    http.post<RoomOccupancy>(`/room/occupancies/${id}/cancel`, { cancelReason, version }).then((r) => r.data),
  reschedule: (id: string, plannedCheckIn: string, plannedCheckOut: string, version: number) =>
    http.patch<WithConflicts<RoomOccupancy>>(`/room/occupancies/${id}/reschedule`, { plannedCheckIn, plannedCheckOut, version }).then((r) => r.data),
}
