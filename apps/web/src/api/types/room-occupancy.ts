import type { ScopedEntityBase } from './common'

export type RoomOccupancyStatus = 'RESERVED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED'

export interface RoomOccupancy extends ScopedEntityBase {
  occupancyNo: string
  roomId: string
  storeId: string
  customerId: string
  contractId: string | null
  status: RoomOccupancyStatus
  plannedCheckIn: string
  plannedCheckOut: string
  actualCheckInAt: string | null
  actualCheckOutAt: string | null
  cancelReason: string | null
  remark: string | null
}

export interface CreateRoomOccupancyDto {
  roomId: string
  storeId: string
  customerId: string
  contractId?: string
  plannedCheckIn: string
  plannedCheckOut: string
  remark?: string
}

export interface QueryRoomOccupancyParams {
  storeId?: string
  roomId?: string
  customerId?: string
  status?: RoomOccupancyStatus
  /** 房态横排时间轴用：查跟 [from, to] 有重叠的占用记录，两个要么都传要么都不传 */
  from?: string
  to?: string
}

export interface RescheduleRoomOccupancyDto {
  plannedCheckIn: string
  plannedCheckOut: string
  version: number
}
