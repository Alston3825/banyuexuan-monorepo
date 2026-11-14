import { http } from '../client'
import type { Paginated } from '../types/common'
import type { AuditLog, QueryAuditLogParams } from '../types/audit-log'

export const auditLogApi = {
  list: (params: QueryAuditLogParams) =>
    http.get<Paginated<AuditLog>>('/audit-logs', { params }).then((r) => r.data),
}
