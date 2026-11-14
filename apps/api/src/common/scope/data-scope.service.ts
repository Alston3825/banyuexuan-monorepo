import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestContextService } from '../context/request-context.service';

/**
 * 数据范围解析：租户 → 区域 → 门店 → 部门 → 团队 → 本人。
 * 多条授权取并集，体现"跨店查询/执行需要独立授权"——是显式加一条 AccountRoleAssignment 记录，
 * 而不是隐式放开范围。
 */
@Injectable()
export class DataScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /** 返回 'ALL'（无需过滤）或允许访问的门店 id 列表。 */
  async resolveAllowedStoreIds(ctx: RequestContextService): Promise<'ALL' | string[]> {
    const grants = await ctx.getScopeGrants();
    if (grants.some((g) => g.scopeType === 'TENANT')) return 'ALL';

    const storeIdSets: string[][] = [];
    for (const grant of grants) {
      if (!grant.scopeId) continue;
      switch (grant.scopeType) {
        case 'REGION': {
          const stores = await this.prisma.store.findMany({
            where: { regionId: grant.scopeId },
            select: { id: true },
          });
          storeIdSets.push(stores.map((s) => s.id));
          break;
        }
        case 'STORE':
          storeIdSets.push([grant.scopeId]);
          break;
        case 'DEPARTMENT': {
          const dept = await this.prisma.department.findUnique({
            where: { id: grant.scopeId },
            select: { storeId: true },
          });
          if (dept?.storeId) storeIdSets.push([dept.storeId]);
          break;
        }
        case 'TEAM': {
          const team = await this.prisma.team.findUnique({
            where: { id: grant.scopeId },
            select: { storeId: true },
          });
          if (team?.storeId) storeIdSets.push([team.storeId]);
          break;
        }
        case 'SELF':
          // SELF 不映射到门店集合，由调用方按 createdBy 过滤
          break;
      }
    }
    return Array.from(new Set(storeIdSets.flat()));
  }

  /** 写操作前校验目标门店是否在授权范围内，否则 403。传入 null/undefined 视为总部级操作，放行。 */
  async assertStoreAccessible(ctx: RequestContextService, storeId?: string | null): Promise<void> {
    if (!storeId) return;
    const allowed = await this.resolveAllowedStoreIds(ctx);
    if (allowed === 'ALL') return;
    if (!allowed.includes(storeId)) {
      throw new ForbiddenException('无权访问该门店范围内的数据');
    }
  }

  /** 是否拥有 SELF 之外的任意范围授权（用于判断"仅看自己"场景）。 */
  async hasOnlySelfScope(ctx: RequestContextService): Promise<boolean> {
    const grants = await ctx.getScopeGrants();
    return grants.length > 0 && grants.every((g) => g.scopeType === 'SELF');
  }
}
