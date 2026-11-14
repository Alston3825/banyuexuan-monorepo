import { http } from '../client'
import type { ApprovalRow, ApprovalTab, WorkflowInstance, WorkflowProgress } from '../types/workflow'

export const workflowInstanceApi = {
  get: (id: string) => http.get<WorkflowInstance>(`/workflow/instances/${id}`).then((r) => r.data),
  findByBusiness: (businessType: string, businessId: string) =>
    http
      .get<WorkflowInstance | null>('/workflow/instances', { params: { businessType, businessId } })
      .then((r) => r.data),
  approve: (id: string, comment?: string) =>
    http.post<WorkflowInstance>(`/workflow/instances/${id}/approve`, { comment }).then((r) => r.data),
  reject: (id: string, comment?: string) =>
    http.post<WorkflowInstance>(`/workflow/instances/${id}/reject`, { comment }).then((r) => r.data),
  withdraw: (id: string, comment?: string) =>
    http.post<WorkflowInstance>(`/workflow/instances/${id}/withdraw`, { comment }).then((r) => r.data),
  reassign: (id: string, toAccountId: string, comment?: string) =>
    http
      .post<WorkflowInstance>(`/workflow/instances/${id}/reassign`, { toAccountId, comment })
      .then((r) => r.data),
  addApprover: (id: string, accountId: string, comment?: string) =>
    http
      .post<WorkflowInstance>(`/workflow/instances/${id}/add-approver`, { accountId, comment })
      .then((r) => r.data),
  cc: (id: string, accountIds: string[]) =>
    http.post<WorkflowInstance>(`/workflow/instances/${id}/cc`, { accountIds }).then((r) => r.data),
  /** 审批进度（带姓名、时限、超时、我能做的操作） */
  progress: (id: string) => http.get<WorkflowProgress>(`/workflow/instances/${id}/progress`).then((r) => r.data),
  progressByBusiness: (businessType: string, businessId: string) =>
    http.get<WorkflowProgress | null>('/workflow/instances/progress', { params: { businessType, businessId } }).then((r) => r.data),
  approvals: (tab: ApprovalTab, keyword?: string) => http.get<ApprovalRow[]>('/workflow/instances/approvals', { params: { tab, keyword: keyword || undefined } }).then((r) => r.data),
  urge: (id: string, comment?: string) => http.post<WorkflowInstance>(`/workflow/instances/${id}/urge`, { comment }).then((r) => r.data),
  archive: (id: string) => http.post<WorkflowInstance>(`/workflow/instances/${id}/archive`).then((r) => r.data),
}
