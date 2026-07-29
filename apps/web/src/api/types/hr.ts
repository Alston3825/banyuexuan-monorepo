import type { CommonStatus } from './common'

export type EmploymentType = 'EMPLOYEE' | 'NON_EMPLOYEE'
export type EmployeeProfileStatus = 'ACTIVE' | 'ON_LEAVE' | 'TERMINATED'
export type CommissionType = 'SALES' | 'LABOR'
export type CommissionRecordStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
export type PayrollRecordStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'PAID'

export interface EmployeeProfileAccount {
  id: string
  realName: string
  username: string
  storeId: string | null
  departmentId: string | null
  positionId: string | null
}

export interface EmployeeProfile {
  id: string
  tenantId: string
  accountId: string
  employeeNo: string
  hireDate: string
  employmentType: EmploymentType
  healthCertExpiresAt: string | null
  contractExpiresAt: string | null
  probationEndsAt: string | null
  terminationDate: string | null
  status: EmployeeProfileStatus
  remark: string | null
  createdAt: string
  updatedAt: string
  version: number
  account: EmployeeProfileAccount
}

export interface EmployeeProfileExpiryAlert extends EmployeeProfile {
  alerts: { type: 'HEALTH_CERT' | 'CONTRACT' | 'PROBATION'; expiresAt: string; isExpired: boolean }[]
}

export interface CreateEmployeeProfileDto {
  accountId: string
  employeeNo: string
  hireDate: string
  employmentType?: EmploymentType
  healthCertExpiresAt?: string
  contractExpiresAt?: string
  probationEndsAt?: string
  remark?: string
}

export interface UpdateEmployeeProfileDto {
  healthCertExpiresAt?: string
  contractExpiresAt?: string
  probationEndsAt?: string
  terminationDate?: string
  status?: EmployeeProfileStatus
  remark?: string
  version: number
}

export interface ShiftDefinition {
  id: string
  tenantId: string
  storeId: string
  code: string
  name: string
  startTime: string
  endTime: string
  status: CommonStatus
  createdAt: string
  updatedAt: string
  version: number
}

export interface CreateShiftDefinitionDto {
  storeId: string
  code: string
  name: string
  startTime: string
  endTime: string
}

export interface UpdateShiftDefinitionDto {
  name?: string
  startTime?: string
  endTime?: string
  status?: CommonStatus
  version: number
}

export interface ScheduleEntry {
  id: string
  tenantId: string
  storeId: string
  employeeProfileId: string
  workDate: string
  shiftDefinitionId: string
  remark: string | null
  createdAt: string
  updatedAt: string
  version: number
  employeeProfile: EmployeeProfile
  shiftDefinition: ShiftDefinition
}

export interface CreateScheduleEntryDto {
  storeId: string
  employeeProfileId: string
  workDate: string
  shiftDefinitionId: string
  remark?: string
}

export interface UpdateScheduleEntryDto {
  shiftDefinitionId?: string
  remark?: string
  version: number
}

export interface CommissionAllocationInput {
  employeeProfileId: string
  roleLabel: string
  basisPoints: number
}

export interface CommissionAllocation extends CommissionAllocationInput {
  id: string
  commissionRecordId: string
  amount: number
  employeeProfile: EmployeeProfile
}

export interface CommissionRecord {
  id: string
  tenantId: string
  storeId: string
  type: CommissionType
  sourceType: string
  sourceId: string
  totalAmount: number
  status: CommissionRecordStatus
  remark: string | null
  cancelReason: string | null
  createdAt: string
  updatedAt: string
  version: number
  allocations: CommissionAllocation[]
}

export interface CreateCommissionRecordDto {
  storeId: string
  type: CommissionType
  sourceType: string
  sourceId: string
  totalAmount: number
  remark?: string
  allocations: CommissionAllocationInput[]
}

export interface PayrollRecord {
  id: string
  tenantId: string
  storeId: string
  employeeProfileId: string
  period: string
  baseSalary: number
  commissionTotal: number
  deductions: number
  netAmount: number
  status: PayrollRecordStatus
  paidAt: string | null
  remark: string | null
  cancelReason: string | null
  createdAt: string
  updatedAt: string
  version: number
  employeeProfile: EmployeeProfile
}

export interface CreatePayrollRecordDto {
  storeId: string
  employeeProfileId: string
  period: string
  baseSalary: number
  deductions?: number
  remark?: string
}
