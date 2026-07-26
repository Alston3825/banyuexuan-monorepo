import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AUDIT_SENSITIVE_QUERY_KEY } from '../decorators/audit-sensitive-query.decorator';
import { AuditLogService } from '../../audit/audit-log.service';

/** 全局拦截器，不依赖 REQUEST-scoped provider，直接从原始 request 取上下文字段。 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditLogService: AuditLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const isSensitiveQuery = this.reflector.getAllAndOverride<boolean>(AUDIT_SENSITIVE_QUERY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!isSensitiveQuery) return next.handle();

    const request = context.switchToHttp().getRequest();
    const entityType = context.getClass().name.replace('Controller', '');

    return next.handle().pipe(
      tap(() => {
        void this.auditLogService.record({
          action: 'SENSITIVE_QUERY',
          entityType,
          tenantId: request.user?.tenantId,
          storeId: request.user?.storeId,
          accountId: request.user?.accountId,
          ip: request.ip,
          userAgent: request.headers?.['user-agent'],
          requestId: request.requestId,
          remark: `${request.method} ${request.url}`,
        });
      }),
    );
  }
}
