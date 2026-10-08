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

export interface ConflictBrief {
  id: string
  occupancyNo: string
  customerName: string
  status: 'RESERVED' | 'CHECKED_IN'
  plannedCheckIn: string
  plannedCheckOut: string
  /** SIGNED=已签合同（优先保留）；INTENT=只有意向 */
  priority: 'SIGNED' | 'INTENT'
}

/** 同一间房两条预订冲突（日期重叠，或间隔不够整理房间） */
export interface RoomConflict {
  roomId: string
  roomNo: string
  a: ConflictBrief
  b: ConflictBrief
  overlapDays: number
  bufferOnly: boolean
  startsInDays: number
  suggestId: string
}

export interface FreeRoom {
  id: string
  roomNo: string
  floor: string
  roomTypeName: string
  sameType: boolean
}

/** 新建/改期保存成功后，如果和别的预订冲突，会带上冲突提示（只提示不拦截） */
export type WithConflicts<T> = T & { conflicts?: ConflictBrief[] }

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
