import { http } from '../client'
import type {
  CreateExpenseClaimDto,
  CreateGeneralMemoDto,
  CreateLeaveRequestDto,
  ExpenseClaim,
  GeneralMemo,
  LeaveRequest,
} from '../types/office'

export const leaveRequestApi = {
  list: (params?: { storeId?: string; employeeProfileId?: string; status?: string }) => http.get<LeaveRequest[]>('/office/leave-requests', { params }).then((r) => r.data),
  create: (body: CreateLeaveRequestDto) => http.post<LeaveRequest>('/office/leave-requests', body).then((r) => r.data),
  submit: (id: string, version: number) => http.post<LeaveRequest>(`/office/leave-requests/${id}/submit`, { version }).then((r) => r.data),
  cancel: (id: string, cancelReason: string, version: number) => http.post<LeaveRequest>(`/office/leave-requests/${id}/cancel`, { cancelReason, version }).then((r) => r.data),
}

export const expenseClaimApi = {
  list: (params?: { storeId?: string; applicantId?: string; status?: string }) => http.get<ExpenseClaim[]>('/office/expense-claims', { params }).then((r) => r.data),
  create: (body: CreateExpenseClaimDto) => http.post<ExpenseClaim>('/office/expense-claims', body).then((r) => r.data),
  submit: (id: string, version: number) => http.post<ExpenseClaim>(`/office/expense-claims/${id}/submit`, { version }).then((r) => r.data),
  cancel: (id: string, cancelReason: string, version: number) => http.post<ExpenseClaim>(`/office/expense-claims/${id}/cancel`, { cancelReason, version }).then((r) => r.data),
}

export const generalMemoApi = {
  list: (params?: { storeId?: string; applicantId?: string; status?: string }) => http.get<GeneralMemo[]>('/office/general-memos', { params }).then((r) => r.data),
  create: (body: CreateGeneralMemoDto) => http.post<GeneralMemo>('/office/general-memos', body).then((r) => r.data),
  submit: (id: string, version: number) => http.post<GeneralMemo>(`/office/general-memos/${id}/submit`, { version }).then((r) => r.data),
  cancel: (id: string, cancelReason: string, version: number) => http.post<GeneralMemo>(`/office/general-memos/${id}/cancel`, { cancelReason, version }).then((r) => r.data),
}
