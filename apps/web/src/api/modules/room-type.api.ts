import { http } from '../client'
import type { RoomType, CreateRoomTypeDto, UpdateRoomTypeDto } from '../types/room-type'

export const roomTypeApi = {
  list: () => http.get<RoomType[]>('/room/types').then((r) => r.data),
  get: (id: string) => http.get<RoomType>(`/room/types/${id}`).then((r) => r.data),
  create: (body: CreateRoomTypeDto) => http.post<RoomType>('/room/types', body).then((r) => r.data),
  update: (id: string, body: UpdateRoomTypeDto) => http.patch<RoomType>(`/room/types/${id}`, body).then((r) => r.data),
}
