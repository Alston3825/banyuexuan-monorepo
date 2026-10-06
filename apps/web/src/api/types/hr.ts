import type { CommonStatus } from './common'

export type EmploymentType = 'EMPLOYEE' | 'NON_EMPLOYEE'
export type EmployeeProfileStatus = 'ACTIVE' | 'ON_LEAVE' | 'TERMINATED'
export type EmployeeContractType = 'LABOR' | 'PROBATION' | 'SERVICE' | 'OVERAGE' | 'PENDING_SIGN'
export type SocialInsuranceStatus = 'ENROLLED' | 'NOT_ENROLLED'
export type EmployeeGender = 'MALE' | 'FEMALE'
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
  phone: string | null
  store: { name: string } | null
  department: { name: string } | null
  position: { name: string } | null
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
  terminationReason: string | null
  status: EmployeeProfileStatus
  contractType: EmployeeContractType | null
  socialInsurance: SocialInsuranceStatus | null
  idCardNo: string | null
  gender: EmployeeGender | null
  birthDate: string | null
  bankAccountNo: string | null
  bankName: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  emergencyContactRelation: string | null
  address: string | null
  remark: string | null
  /** 以下由后端附带：来自账号的手机/部门/职务/门店，以及按入职日期算出的工龄（满几年） */
  phone: string | null
  storeName: string | null
  departmentName: string | null
  positionName: string | null
  tenureYears: number
  createdAt: string
  updatedAt: string
  version: number
  account: EmployeeProfileAccount
}

export interface EmployeeProfileExpiryAlert extends EmployeeProfile {
  alerts: { type: 'HEALTH_CERT' | 'CONTRACT' | 'PROBATION'; expiresAt: string; isExpired: boolean }[]
}

/** 员工信息表字段：文字类传空字符串 = 清空 */
export interface EmployeeProfileDetailFields {
  contractType?: EmployeeContractType
  socialInsurance?: SocialInsuranceStatus
  idCardNo?: string
  bankAccountNo?: string
  bankName?: string
  emergencyContactName?: string
  emergencyContactPhone?: string
  emergencyContactRelation?: string
  address?: string
}

export interface CreateEmployeeProfileDto extends EmployeeProfileDetailFields {
  accountId: string
  employeeNo: string
  hireDate: string
  employmentType?: EmploymentType
  healthCertExpiresAt?: string
  contractExpiresAt?: string
  probationEndsAt?: string
  remark?: string
}

export interface UpdateEmployeeProfileDto extends EmployeeProfileDetailFields {
  employeeNo?: string
  hireDate?: string
  employmentType?: EmploymentType
  healthCertExpiresAt?: string
  contractExpiresAt?: string
  probationEndsAt?: string
  terminationDate?: string
  terminationReason?: string
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
