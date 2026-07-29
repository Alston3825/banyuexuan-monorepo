import type { ScopedEntityBase } from './common'

export type VehicleStatus = 'AVAILABLE' | 'MAINTENANCE' | 'RETIRED'
export type VehicleBookingStatus = 'BOOKED' | 'CANCELLED'
export type UtilityExpenseType = 'ELECTRICITY' | 'WATER' | 'GAS' | 'PROPERTY_MANAGEMENT' | 'OTHER'

export interface Vehicle extends ScopedEntityBase {
  plateNumber: string
  model: string
  status: VehicleStatus
  remark: string | null
}

export interface CreateVehicleDto {
  plateNumber: string
  model: string
  remark?: string
}

export interface UpdateVehicleDto {
  model?: string
  remark?: string
  status?: VehicleStatus
  version: number
}

export interface VehicleBookingApplicant {
  id: string
  realName: string
}

export interface VehicleBooking {
  id: string
  tenantId: string
  vehicleId: string
  storeId: string
  applicantId: string
  purpose: string
  startTime: string
  endTime: string
  status: VehicleBookingStatus
  cancelReason: string | null
  createdAt: string
  updatedAt: string
  version: number
  vehicle: Vehicle
  applicant: VehicleBookingApplicant
}

export interface CreateVehicleBookingDto {
  vehicleId: string
  storeId: string
  purpose: string
  startTime: string
  endTime: string
}

export interface UtilityExpense {
  id: string
  tenantId: string
  storeId: string
  period: string
  expenseType: UtilityExpenseType
  amount: number
  remark: string | null
  createdAt: string
  updatedAt: string
  version: number
}

export interface CreateUtilityExpenseDto {
  storeId: string
  period: string
  expenseType: UtilityExpenseType
  amount: number
  remark?: string
}

export interface UpdateUtilityExpenseDto {
  amount?: number
  remark?: string
  version: number
}
