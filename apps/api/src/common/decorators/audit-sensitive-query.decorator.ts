import { SetMetadata } from '@nestjs/common';

export const AUDIT_SENSITIVE_QUERY_KEY = 'auditSensitiveQuery';

/** 标记该路由的查询涉及敏感数据，响应成功后由 AuditLogInterceptor 记一条 SENSITIVE_QUERY。 */
export const AuditSensitiveQuery = () => SetMetadata(AUDIT_SENSITIVE_QUERY_KEY, true);
