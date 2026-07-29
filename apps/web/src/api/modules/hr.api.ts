import { http } from '../client'
import type {
  CommissionRecord,
  CreateCommissionRecordDto,
  CreateEmployeeProfileDto,
  CreatePayrollRecordDto,
  CreateScheduleEntryDto,
  CreateShiftDefinitionDto,
  EmployeeProfile,
  EmployeeProfileExpiryAlert,
  PayrollRecord,
  ScheduleEntry,
  ShiftDefinition,
  UpdateEmployeeProfileDto,
  UpdateScheduleEntryDto,
  UpdateShiftDefinitionDto,
} from '../types/hr'

export const employeeProfileApi = {
  list: (params?: { storeId?: string; status?: string }) => http.get<EmployeeProfile[]>('/hr/employee-profiles', { params }).then((r) => r.data),
  get: (id: string) => http.get<EmployeeProfile>(`/hr/employee-profiles/${id}`).then((r) => r.data),
  create: (body: CreateEmployeeProfileDto) => http.post<EmployeeProfile>('/hr/employee-profiles', body).then((r) => r.data),
  update: (id: string, body: UpdateEmployeeProfileDto) => http.patch<EmployeeProfile>(`/hr/employee-profiles/${id}`, body).then((r) => r.data),
  expiryAlerts: (withinDays?: number) =>
    http.get<EmployeeProfileExpiryAlert[]>('/hr/employee-profiles/expiry-alerts', { params: { withinDays } }).then((r) => r.data),
}

export const shiftDefinitionApi = {
  list: (params?: { storeId?: string }) => http.get<ShiftDefinition[]>('/hr/shift-definitions', { params }).then((r) => r.data),
  create: (body: CreateShiftDefinitionDto) => http.post<ShiftDefinition>('/hr/shift-definitions', body).then((r) => r.data),
  update: (id: string, body: UpdateShiftDefinitionDto) => http.patch<ShiftDefinition>(`/hr/shift-definitions/${id}`, body).then((r) => r.data),
}

export const scheduleEntryApi = {
  list: (params?: { storeId?: string; employeeProfileId?: string; startDate?: string; endDate?: string }) =>
    http.get<ScheduleEntry[]>('/hr/schedule-entries', { params }).then((r) => r.data),
  create: (body: CreateScheduleEntryDto) => http.post<ScheduleEntry>('/hr/schedule-entries', body).then((r) => r.data),
  update: (id: string, body: UpdateScheduleEntryDto) => http.patch<ScheduleEntry>(`/hr/schedule-entries/${id}`, body).then((r) => r.data),
  delete: (id: string) => http.delete(`/hr/schedule-entries/${id}`).then((r) => r.data),
}

export const commissionRecordApi = {
  list: (params?: { storeId?: string; type?: string; status?: string }) =>
    http.get<CommissionRecord[]>('/hr/commission-records', { params }).then((r) => r.data),
  get: (id: string) => http.get<CommissionRecord>(`/hr/commission-records/${id}`).then((r) => r.data),
  create: (body: CreateCommissionRecordDto) => http.post<CommissionRecord>('/hr/commission-records', body).then((r) => r.data),
  submit: (id: string, version: number) => http.post<CommissionRecord>(`/hr/commission-records/${id}/submit`, { version }).then((r) => r.data),
  cancel: (id: string, cancelReason: string, version: number) =>
    http.post<CommissionRecord>(`/hr/commission-records/${id}/cancel`, { cancelReason, version }).then((r) => r.data),
}

export const payrollRecordApi = {
  list: (params?: { storeId?: string; employeeProfileId?: string; period?: string; status?: string }) =>
    http.get<PayrollRecord[]>('/hr/payroll-records', { params }).then((r) => r.data),
  get: (id: string) => http.get<PayrollRecord>(`/hr/payroll-records/${id}`).then((r) => r.data),
  create: (body: CreatePayrollRecordDto) => http.post<PayrollRecord>('/hr/payroll-records', body).then((r) => r.data),
  submit: (id: string, version: number) => http.post<PayrollRecord>(`/hr/payroll-records/${id}/submit`, { version }).then((r) => r.data),
  markPaid: (id: string, version: number) => http.post<PayrollRecord>(`/hr/payroll-records/${id}/mark-paid`, { version }).then((r) => r.data),
  cancel: (id: string, cancelReason: string, version: number) =>
    http.post<PayrollRecord>(`/hr/payroll-records/${id}/cancel`, { cancelReason, version }).then((r) => r.data),
}
