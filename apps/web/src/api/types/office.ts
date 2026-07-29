import type { EmployeeProfile } from './hr'

export type OfficeApprovalStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
export type LeaveType = 'SICK' | 'PERSONAL' | 'ANNUAL' | 'OTHER'

export interface LeaveRequest {
  id: string
  tenantId: string
  storeId: string
  employeeProfileId: string
  leaveType: LeaveType
  startDate: string
  endDate: string
  reason: string
  status: OfficeApprovalStatus
  cancelReason: string | null
  createdAt: string
  updatedAt: string
  version: number
  employeeProfile: EmployeeProfile
}

export interface CreateLeaveRequestDto {
  storeId: string
  employeeProfileId: string
  leaveType: LeaveType
  startDate: string
  endDate: string
  reason: string
}

export interface ApplicantSummary {
  id: string
  realName: string
}

export interface ExpenseClaim {
  id: string
  tenantId: string
  storeId: string
  applicantId: string
  amount: number
  category: string
  reason: string
  status: OfficeApprovalStatus
  cancelReason: string | null
  createdAt: string
  updatedAt: string
  version: number
  applicant: ApplicantSummary
}

export interface CreateExpenseClaimDto {
  storeId: string
  amount: number
  category: string
  reason: string
}

export interface GeneralMemo {
  id: string
  tenantId: string
  storeId: string
  applicantId: string
  title: string
  content: string
  status: OfficeApprovalStatus
  cancelReason: string | null
  createdAt: string
  updatedAt: string
  version: number
  applicant: ApplicantSummary
}

export interface CreateGeneralMemoDto {
  storeId: string
  title: string
  content: string
}
