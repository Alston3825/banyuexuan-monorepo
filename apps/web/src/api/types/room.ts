import type { ScopedEntityBase } from './common'
import type { RoomType } from './room-type'

export interface Room extends ScopedEntityBase {
  storeId: string
  roomTypeId: string
  roomNo: string
  floor: string
  underMaintenance: boolean
  maintenanceNote: string | null
  needsCleaning: boolean
  roomType?: RoomType
}

export interface CreateRoomDto {
  storeId: string
  roomTypeId: string
  roomNo: string
  floor: string
}

export interface UpdateRoomDto {
  roomTypeId?: string
  roomNo?: string
  floor?: string
  version: number
}

export interface QueryRoomParams {
  storeId?: string
}

export type ComputedRoomStatus = 'VACANT' | 'RESERVED' | 'OCCUPIED' | 'PENDING_CLEANING' | 'MAINTENANCE'

export interface RoomBoardEntry {
  room: Room
  status: ComputedRoomStatus
  customerId: string | null
  customerName: string | null
  occupancyId: string | null
}

export interface QueryRoomBoardParams {
  storeId: string
  date?: string
}
