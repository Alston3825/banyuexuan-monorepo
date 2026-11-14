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

/** 删除房间前的影响预检（GET /room/rooms/:id/delete-check） */
export interface RoomDeleteCheck {
  roomId: string
  roomNo: string
  occupancyTotal: number
  activeOccupancyCount: number
  deviceCount: number
  blockers: string[]
  hasData: boolean
  canForceDelete: boolean
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
  plannedCheckIn: string | null
  plannedCheckOut: string | null
  expectedDueDate: string | null
  signerName: string | null
  actualCheckInAt: string | null
  contract: {
    id: string
    paperNo: string | null
    orientation: 'SOUTH' | 'NORTH' | 'BOTH' | null
    careMode: 'ONE_TO_ONE' | 'ONE_TO_TWO' | null
    inHouseDays: number | null
    homeServiceDays: number
  } | null
  /** 这次入住的母婴档案里的护理信息：当前生效的护理等级、主责护理师；没建档为 null */
  careBrief: { level: string | null; nurseName: string | null } | null
}

export interface QueryRoomBoardParams {
  storeId: string
  date?: string
}
