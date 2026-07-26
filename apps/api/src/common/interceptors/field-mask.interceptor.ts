import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map, switchMap, from } from 'rxjs';
import { MASK_ENTITY_KEY } from '../decorators/mask-entity.decorator';
import { PermissionLookupService } from '../context/permission-lookup.service';
import { SENSITIVE_FIELD_REGISTRY } from '../masking/sensitive-field-registry';

/** 全局拦截器，不依赖 REQUEST-scoped provider，见 PermissionGuard 同样的说明。 */
@Injectable()
export class FieldMaskInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionLookup: PermissionLookupService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const entityType = this.reflector.getAllAndOverride<string | undefined>(MASK_ENTITY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!entityType || !SENSITIVE_FIELD_REGISTRY[entityType]) {
      return next.handle();
    }
    const rules = SENSITIVE_FIELD_REGISTRY[entityType];
    const request = context.switchToHttp().getRequest();
    const accountId: string | undefined = request.user?.accountId;

    return next.handle().pipe(
      switchMap((result) =>
        from(this.permissionLookup.getPermissionCodes(accountId)).pipe(
          map((permissionCodes) => this.maskResult(result, rules, permissionCodes)),
        ),
      ),
    );
  }

  private maskResult(
    result: unknown,
    rules: { field: string; permissionCode: string; mask: (v: unknown) => unknown }[],
    permissionCodes: Set<string>,
  ): unknown {
    const applicableRules = rules.filter((r) => !permissionCodes.has(r.permissionCode));
    if (applicableRules.length === 0) return result;

    const maskOne = (item: unknown) => {
      if (!item || typeof item !== 'object') return item;
      const clone: Record<string, unknown> = { ...(item as Record<string, unknown>) };
      for (const rule of applicableRules) {
        if (rule.field in clone) {
          clone[rule.field] = rule.mask(clone[rule.field]);
        }
      }
      return clone;
    };

    if (Array.isArray(result)) return result.map(maskOne);
    if (result && typeof result === 'object' && Array.isArray((result as any).data)) {
      return { ...(result as object), data: (result as any).data.map(maskOne) };
    }
    return maskOne(result);
  }
}
