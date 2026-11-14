import { AxiosError } from 'axios'
import { http } from '../client'
import type { Account, AssignRoleDto, CreateAccountDto, ImportCommitDto, ImportCommitResult, ImportPreview, UpdateAccountDto } from '../types/account'

export const accountApi = {
  // 同 storeApi.list() 的道理：大量业务页面用这个接口只是填"归属销售"下拉选项，
  // 没有platform.account权限的账号（普通员工角色）打这个接口403是预期内的正常降级，
  // 静默返回空列表即可，真正的账号管理页(/iam/accounts)已经在路由守卫那层挡住了。
  list: () =>
    http
      .get<Account[]>('/platform/accounts', { silent403: true } as any)
      .then((r) => r.data)
      .catch((err: AxiosError) => (err.response?.status === 403 ? [] : Promise.reject(err))),
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
  remove: (id: string) => http.delete(`/platform/accounts/${id}`).then((r) => r.data),
  /** 员工信息表批量开通：第一步读表检查，第二步确认开通 */
  importPreview: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return http.post<ImportPreview>('/platform/accounts/import/preview', fd).then((r) => r.data)
  },
  importCommit: (body: ImportCommitDto) => http.post<ImportCommitResult>('/platform/accounts/import/commit', body).then((r) => r.data),
}
