import { http } from '../client'
import type { Room, CreateRoomDto, UpdateRoomDto, QueryRoomParams, RoomBoardEntry, QueryRoomBoardParams, RoomDeleteCheck } from '../types/room'

export const roomApi = {
  list: (params?: QueryRoomParams) => http.get<Room[]>('/room/rooms', { params }).then((r) => r.data),
  get: (id: string) => http.get<Room>(`/room/rooms/${id}`).then((r) => r.data),
  create: (body: CreateRoomDto) => http.post<Room>('/room/rooms', body).then((r) => r.data),
  update: (id: string, body: UpdateRoomDto) => http.patch<Room>(`/room/rooms/${id}`, body).then((r) => r.data),
  board: (params: QueryRoomBoardParams) => http.get<RoomBoardEntry[]>('/room/rooms/board', { params }).then((r) => r.data),
  setMaintenance: (id: string, underMaintenance: boolean, note: string | undefined, version: number) =>
    http.patch<Room>(`/room/rooms/${id}/maintenance`, { underMaintenance, note, version }).then((r) => r.data),
  deleteCheck: (id: string) => http.get<RoomDeleteCheck>(`/room/rooms/${id}/delete-check`).then((r) => r.data),
  remove: (id: string, confirmRoomNo?: string) =>
    http.delete<{ success: boolean }>(`/room/rooms/${id}`, { params: { confirmRoomNo } }).then((r) => r.data),
  markCleaned: (id: string, version: number) =>
    http.patch<Room>(`/room/rooms/${id}/clean`, { version }).then((r) => r.data),
}
