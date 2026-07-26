import { http } from '../client'
import type { Account, AssignRoleDto, CreateAccountDto, UpdateAccountDto } from '../types/account'

export const accountApi = {
  list: () => http.get<Account[]>('/platform/accounts').then((r) => r.data),
  get: (id: string) => http.get<Account>(`/platform/accounts/${id}`).then((r) => r.data),
  create: (body: CreateAccountDto) => http.post<Account>('/platform/accounts', body).then((r) => r.data),
  update: (id: string, body: UpdateAccountDto) =>
    http.patch<Account>(`/platform/accounts/${id}`, body).then((r) => r.data),
  resetPassword: (id: string, newPassword: string) =>
    http.patch(`/platform/accounts/${id}/password`, { newPassword }).then((r) => r.data),
  assignRole: (id: string, body: AssignRoleDto) =>
    http.post(`/platform/accounts/${id}/role-assignments`, body).then((r) => r.data),
  revokeRoleAssignment: (id: string, assignmentId: string) =>
    http.delete(`/platform/accounts/${id}/role-assignments/${assignmentId}`).then((r) => r.data),
}
