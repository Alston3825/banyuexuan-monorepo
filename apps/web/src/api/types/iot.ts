import type { CommonStatus, ScopedEntityBase } from './common'

export type DeviceCategory = 'VITAL_SIGN' | 'SECURITY' | 'ACCESS_CONTROL' | 'CALL_SERVICE' | 'IDENTITY_SETTLEMENT' | 'PRINTING' | 'UTILITY_METER'
export type DeviceStatus = 'ONLINE' | 'OFFLINE' | 'DISABLED'

export interface DeviceType extends ScopedEntityBase {
  category: DeviceCategory
  name: string
  protocol: string
  requiresCommandConfirmation: boolean
  status: CommonStatus
}

export interface CreateDeviceTypeDto {
  category: DeviceCategory
  name: string
  protocol: string
  requiresCommandConfirmation?: boolean
}

export interface UpdateDeviceTypeDto {
  category?: DeviceCategory
  name?: string
  protocol?: string
  requiresCommandConfirmation?: boolean
  status?: CommonStatus
  version: number
}

export interface Device extends ScopedEntityBase {
  storeId: string
  deviceTypeId: string
  code: string
  name: string
  roomId: string | null
  status: DeviceStatus
  lastSeenAt: string | null
}

export interface CreateDeviceDto {
  storeId: string
  deviceTypeId: string
  code: string
  name: string
  roomId?: string
}

export interface UpdateDeviceDto {
  name?: string
  roomId?: string
  status?: DeviceStatus
  version: number
}

export interface DeviceEvent {
  id: string
  tenantId: string
  storeId: string
  deviceId: string
  eventType: string
  payload: Record<string, unknown>
  occurredAt: string
  processedAt: string | null
  businessRefType: string | null
  businessRefId: string | null
  processingError: string | null
  createdBy: string
  createdAt: string
}

export interface ReportDeviceEventDto {
  deviceId: string
  eventType: string
  payload?: Record<string, unknown>
}

export interface DeviceShadow {
  id: string
  deviceId: string
  desiredState: Record<string, unknown> | null
  desiredVersion: number
  reportedState: Record<string, unknown> | null
  reportedVersion: number
  lastCommandAt: string | null
  lastReportedAt: string | null
  updatedAt: string
}
