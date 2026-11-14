import { http } from '../client'
import type { CreateDemoApprovalDto, DemoApprovalRequest } from '../types/workflow'
import type { WorkflowInstance } from '../types/workflow'

export const demoApprovalApi = {
  list: () => http.get<DemoApprovalRequest[]>('/demo-approvals').then((r) => r.data),
  get: (id: string) => http.get<DemoApprovalRequest>(`/demo-approvals/${id}`).then((r) => r.data),
  create: (body: CreateDemoApprovalDto) =>
    http.post<DemoApprovalRequest>('/demo-approvals', body).then((r) => r.data),
  /** 提交后返回的是新建的 WorkflowInstance，不是审批单本身。 */
  submit: (id: string) => http.post<WorkflowInstance>(`/demo-approvals/${id}/submit`).then((r) => r.data),
}
