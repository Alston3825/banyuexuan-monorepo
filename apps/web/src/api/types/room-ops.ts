export type RoomCallStatus = 'PENDING' | 'HANDLED'
export type RoomOutingStatus = 'PLANNED' | 'OUT' | 'RETURNED' | 'CANCELLED'
export type RoomRequisitionStatus = 'REQUESTED' | 'FULFILLED'

export interface RoomCall {
  id: string
  tenantId: string
  storeId: string
  occupancyId: string
  reason: string
  status: RoomCallStatus
  calledAt: string
  handledAt: string | null
  handledBy: string | null
  remark: string | null
  createdAt: string
}

export interface CreateRoomCallDto {
  occupancyId: string
  reason: string
  remark?: string
}

export interface RoomOuting {
  id: string
  tenantId: string
  storeId: string
  occupancyId: string
  plannedOutAt: string
  plannedBackAt: string
  actualOutAt: string | null
  actualBackAt: string | null
  riskNote: string | null
  status: RoomOutingStatus
  cancelReason: string | null
  createdAt: string
  version: number
}

export interface CreateRoomOutingDto {
  occupancyId: string
  plannedOutAt: string
  plannedBackAt: string
  riskNote?: string
}

export interface RoomServiceRequisition {
  id: string
  tenantId: string
  storeId: string
  occupancyId: string
  itemName: string
  quantity: number
  status: RoomRequisitionStatus
  requestedAt: string
  fulfilledAt: string | null
  fulfilledBy: string | null
  remark: string | null
  createdAt: string
}

export interface CreateRoomServiceRequisitionDto {
  occupancyId: string
  itemName: string
  quantity?: number
  remark?: string
}
