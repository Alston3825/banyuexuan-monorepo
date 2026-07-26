export type WorkflowInstanceStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'ARCHIVED'

export type WorkflowApproverRole = 'APPROVER' | 'ADDED_APPROVER' | 'CC'
export type WorkflowApproverStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REASSIGNED' | 'SKIPPED' | 'NOTIFIED'
export type WorkflowActionType =
  | 'SUBMIT'
  | 'APPROVE'
  | 'REJECT'
  | 'WITHDRAW'
  | 'REASSIGN'
  | 'ADD_APPROVER'
  | 'CC'
  | 'ARCHIVE'

export interface WorkflowNode {
  id: string
  workflowDefinitionId: string
  seq: number
  name: string
  approverType: 'ROLE' | 'ACCOUNT'
  approverRoleId: string | null
  approverAccountId: string | null
}

export interface WorkflowDefinition {
  id: string
  tenantId: string
  code: string
  name: string
  version: number
  status: 'DRAFT' | 'PUBLISHED' | 'DISABLED'
  nodes: WorkflowNode[]
}

export interface WorkflowInstanceApprover {
  id: string
  workflowInstanceId: string
  nodeSeq: number
  accountId: string
  role: WorkflowApproverRole
  status: WorkflowApproverStatus
  comment: string | null
  actedAt: string | null
  reassignedFromId: string | null
  createdAt: string
}

export interface WorkflowActionLog {
  id: string
  workflowInstanceId: string
  nodeSeq: number | null
  actorId: string
  action: WorkflowActionType
  comment: string | null
  createdAt: string
}

export interface WorkflowInstance {
  id: string
  tenantId: string
  storeId: string | null
  workflowDefinitionId: string
  businessType: string
  businessId: string
  title: string
  status: WorkflowInstanceStatus
  currentNodeSeq: number | null
  initiatorId: string
  submittedAt: string | null
  finishedAt: string | null
  createdAt: string
  updatedAt: string
  version: number
  approvers?: WorkflowInstanceApprover[]
  actions?: WorkflowActionLog[]
}

export interface DemoApprovalRequest {
  id: string
  tenantId: string
  storeId: string | null
  title: string
  content: string
  amount: number | null
  applicantId: string
  status: WorkflowInstanceStatus
  createdAt: string
  updatedAt: string
  version: number
}

export interface CreateDemoApprovalDto {
  title: string
  content: string
  amount?: number
}
