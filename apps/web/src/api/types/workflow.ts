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
  | 'URGE'

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

// ---------------- 审批进度 / 审批中心 / 待办 / 流程设置 ----------------

export type NodeState = 'DONE' | 'CURRENT' | 'WAITING' | 'REJECTED' | 'WITHDRAWN' | 'SKIPPED'

export interface ProgressApprover {
  accountId: string
  name: string
  role: WorkflowApproverRole
  status: WorkflowApproverStatus
  comment: string | null
  actedAt: string | null
  arrivedAt: string
  dueAt: string | null
  overdue: boolean
}

export interface ProgressNode {
  seq: number
  name: string
  mode: 'ALL' | 'ANY'
  timeoutHours: number | null
  state: NodeState
  planned: string
  approvers: ProgressApprover[]
}

export interface WorkflowProgress {
  id: string
  title: string
  status: WorkflowInstanceStatus
  businessType: string
  businessLabel: string
  businessId: string
  businessPath: string | null
  definitionName: string
  submittedAt: string | null
  finishedAt: string | null
  currentNodeSeq: number | null
  initiator: { id: string; name: string }
  nodes: ProgressNode[]
  ccs: { accountId: string; name: string }[]
  actions: { id: string; action: WorkflowActionType; nodeSeq: number | null; comment: string | null; createdAt: string; actorId: string; actorName: string }[]
  urgeCount: number
  lastUrgedAt: string | null
  me: { canApprove: boolean; canWithdraw: boolean; canUrge: boolean; canReassignAsAdmin: boolean }
}

export type ApprovalTab = 'pending' | 'done' | 'mine' | 'cc'

export interface ApprovalRow {
  instanceId: string
  title: string
  businessType: string
  businessLabel: string
  status: WorkflowInstanceStatus
  initiatorName?: string
  submittedAt?: string | null
  finishedAt?: string | null
  nodeName?: string
  arrivedAt?: string
  dueAt?: string | null
  overdue?: boolean
  urgeCount?: number
  waitingFor?: string[]
  myStatus?: WorkflowApproverStatus
  myComment?: string | null
  actedAt?: string | null
}

export type TodoKind = 'APPROVAL' | 'REJECTED' | 'EXPIRY' | 'OUTREACH' | 'COLLECT' | 'PURCHASE' | 'RECEIVE' | 'ROOM_CONFLICT' | 'SATISFACTION'

export interface TodoItem {
  key: string
  kind: TodoKind
  title: string
  desc: string
  link: string
  dueAt: string | null
  overdue: boolean
  level: 'danger' | 'warning' | 'info'
}

export interface TodoSummary {
  total: number
  overdue: number
  byKind: Record<TodoKind, number>
  items: TodoItem[]
}

export interface SettingsNode {
  seq: number
  name: string
  approverType: 'ROLE' | 'ACCOUNT'
  approverRoleId: string | null
  approverRoleIds: string[]
  approverAccountId: string | null
  /** 指定的员工（可多位） */
  approverAccountIds: string[]
  approverLabel: string
  approvalMode: 'ALL' | 'ANY'
  timeoutHours: number | null
}

export interface SettingsDefinition {
  id: string
  code: string
  name: string
  version: number
  enabled: boolean
  updatedAt: string
  inReview: number
  nodes: SettingsNode[]
}

export interface SaveDefinitionDto {
  name?: string
  enabled?: boolean
  nodes?: {
    name: string
    approverType: 'ROLE' | 'ACCOUNT'
    approverRoleId?: string
    /** 指定多个角色 */
    approverRoleIds?: string[]
    approverAccountId?: string
    /** 指定多位员工（或签选 2~3 人等） */
    approverAccountIds?: string[]
    approvalMode: 'ALL' | 'ANY'
    timeoutHours?: number | null
  }[]
}
