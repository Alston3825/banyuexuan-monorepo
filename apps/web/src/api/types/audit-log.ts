export type AuditAction =
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'VOID'
  | 'STATE_TRANSITION'
  | 'APPROVE'
  | 'REJECT'
  | 'WITHDRAW'
  | 'REASSIGN'
  | 'ADD_APPROVER'
  | 'CC'
  | 'ARCHIVE'
  | 'SENSITIVE_QUERY'
  | 'EXPORT'
  | 'PRINT'

export interface AuditLog {
  id: string
  tenantId: string | null
  storeId: string | null
  accountId: string | null
  action: AuditAction
  entityType: string
  entityId: string | null
  beforeData: unknown
  afterData: unknown
  changedFields: string[] | null
  ip: string | null
  userAgent: string | null
  requestId: string | null
  result: string
  remark: string | null
  createdAt: string
}

export interface QueryAuditLogParams {
  entityType?: string
  entityId?: string
  accountId?: string
  action?: AuditAction
  page?: number
  pageSize?: number
}
