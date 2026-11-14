import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { PermissionLookupService } from '../context/permission-lookup.service';

/**
 * 全局守卫，不能依赖 REQUEST-scoped 的 RequestContextService（会导致其他构造参数
 * 解析失败），改用普通单例的 PermissionLookupService，直接从原始 request.user 取账号。
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionLookup: PermissionLookupService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredCode = this.reflector.getAllAndOverride<string | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredCode) return true; // 未声明权限点，仅要求已认证（由 JwtAuthGuard 保证）

    const request = context.switchToHttp().getRequest();
    const accountId: string | undefined = request.user?.accountId;
    const codes = await this.permissionLookup.getPermissionCodes(accountId);
    if (!codes.has(requiredCode)) {
      throw new ForbiddenException(`缺少权限：${requiredCode}`);
    }
    return true;
  }
}
