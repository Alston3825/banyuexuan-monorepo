import { http } from '../client'
import type {
  CreateRoomCallDto,
  CreateRoomOutingDto,
  CreateRoomServiceRequisitionDto,
  RoomCall,
  RoomOuting,
  RoomServiceRequisition,
} from '../types/room-ops'

export const roomCallApi = {
  list: (params?: { occupancyId?: string; storeId?: string; status?: string }) =>
    http.get<RoomCall[]>('/room/calls', { params }).then((r) => r.data),
  create: (body: CreateRoomCallDto) => http.post<RoomCall>('/room/calls', body).then((r) => r.data),
  handle: (id: string) => http.post<RoomCall>(`/room/calls/${id}/handle`, {}).then((r) => r.data),
}

export const roomOutingApi = {
  list: (params?: { occupancyId?: string; storeId?: string; status?: string }) =>
    http.get<RoomOuting[]>('/room/outings', { params }).then((r) => r.data),
  create: (body: CreateRoomOutingDto) => http.post<RoomOuting>('/room/outings', body).then((r) => r.data),
  checkOut: (id: string, version: number) => http.post<RoomOuting>(`/room/outings/${id}/check-out`, { version }).then((r) => r.data),
  checkBack: (id: string, version: number) => http.post<RoomOuting>(`/room/outings/${id}/check-back`, { version }).then((r) => r.data),
  cancel: (id: string, cancelReason: string, version: number) =>
    http.post<RoomOuting>(`/room/outings/${id}/cancel`, { cancelReason, version }).then((r) => r.data),
}

export const roomServiceRequisitionApi = {
  list: (params?: { occupancyId?: string; storeId?: string; status?: string }) =>
    http.get<RoomServiceRequisition[]>('/room/service-requisitions', { params }).then((r) => r.data),
  create: (body: CreateRoomServiceRequisitionDto) =>
    http.post<RoomServiceRequisition>('/room/service-requisitions', body).then((r) => r.data),
  fulfill: (id: string) => http.post<RoomServiceRequisition>(`/room/service-requisitions/${id}/fulfill`, {}).then((r) => r.data),
}
