import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeGrant } from './request-context.service';

/**
 * 普通单例服务（非 REQUEST-scoped），供全局 Guard/Interceptor 使用——
 * 全局 APP_GUARD/APP_INTERCEPTOR 直接依赖 REQUEST-scoped provider 在 NestJS 里
 * 会导致依赖解析失败（reflector/其他构造参数变成 undefined），因此权限点/数据范围
 * 的查询逻辑单独抽成不依赖请求作用域的普通服务，按需传入 accountId。
 * RequestContextService（用于普通 controller/service 内注入）内部逻辑与此一致。
 */
@Injectable()
export class PermissionLookupService {
  constructor(private readonly prisma: PrismaService) {}

  async getPermissionCodes(accountId?: string): Promise<Set<string>> {
    if (!accountId) return new Set();
    const assignments = await this.prisma.accountRoleAssignment.findMany({
      where: {
        accountId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: { role: { include: { permissions: { include: { permissionPoint: true } } } } },
    });
    const codes = new Set<string>();
    for (const assignment of assignments) {
      for (const rp of assignment.role.permissions) {
        codes.add(rp.permissionPoint.code);
      }
    }
    return codes;
  }

  async getScopeGrants(accountId?: string): Promise<ScopeGrant[]> {
    if (!accountId) return [];
    const assignments = await this.prisma.accountRoleAssignment.findMany({
      where: {
        accountId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { scopeType: true, scopeId: true },
    });
    return assignments;
  }
}
