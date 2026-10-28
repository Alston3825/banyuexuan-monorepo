import { BadRequestException, Injectable } from '@nestjs/common';
import { InventoryItem, WarehousePurpose } from '@prisma/client';
import { itemMatchesKeyword } from '../common/item-match';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { BaseScopedCrudService } from '../../common/base/base-scoped-crud.service';

/** 物品：租户全局主数据，不做门店范围过滤（与其余主数据口径一致）。 */
@Injectable()
export class InventoryItemService extends BaseScopedCrudService<InventoryItem> {
  protected readonly entityType = 'InventoryItem';

  constructor(
    private readonly prisma: PrismaService,
    auditLogService: AuditLogService,
    ctx: RequestContextService,
  ) {
    super(auditLogService, ctx);
  }

  protected get delegate() {
    return this.prisma.inventoryItem;
  }

  findMany(): Promise<InventoryItem[]> {
    return this.prisma.inventoryItem.findMany({ where: { tenantId: this.ctx.tenantId }, orderBy: { createdAt: 'desc' } });
  }

  async search(keyword?: string) {
    const all = await this.prisma.inventoryItem.findMany({
      where: { tenantId: this.ctx.tenantId, status: 'ACTIVE' },
      select: { id: true, code: true, name: true, spec: true, brand: true, category: true, unit: true, referencePrice: true },
      orderBy: [{ name: 'asc' }],
      take: 5000,
    });
    // 名称/规格/品牌/编码 + 拼音（全拼/首字母）在内存里匹配，最多返回 30 条
    return all.filter((i) => itemMatchesKeyword(i, keyword)).slice(0, 30);
  }

  /** 下一个自动编码：WP0001、WP0002……（取现有最大号 +1） */
  private async nextCode(): Promise<string> {
    const rows = await this.prisma.inventoryItem.findMany({ where: { tenantId: this.ctx.tenantId, code: { startsWith: 'WP' } }, select: { code: true } });
    let max = 0;
    for (const { code } of rows) {
      const m = /^WP(\d+)$/.exec(code);
      if (m) max = Math.max(max, Number(m[1]));
    }
    return `WP${String(max + 1).padStart(4, '0')}`;
  }

  async create(data: {
    code?: string;
    name: string;
    unit: string;
    category?: string;
    purpose?: WarehousePurpose;
    spec?: string;
    brand?: string;
    referencePrice?: number;
    safetyStockThreshold?: number;
    shelfLifeDays?: number;
  }) {
    const base = { ...data, spec: data.spec?.trim() || undefined, brand: data.brand?.trim() || undefined, tenantId: this.ctx.tenantId };
    if (data.code?.trim()) return super.create({ ...base, code: data.code.trim() });
    // 没填编码：自动编；两个人同时新建撞了号就换下一个号再试一次
    try {
      return await super.create({ ...base, code: await this.nextCode() });
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2002') throw e;
      return super.create({ ...base, code: await this.nextCode() });
    }
  }

  /** 规格/品牌传空字符串 = 清空（存成 null） */
  update(id: string, data: Record<string, unknown>, expectedVersion: number) {
    const cleaned = { ...data };
    for (const k of ['spec', 'brand', 'category'] as const) {
      if (typeof cleaned[k] === 'string') cleaned[k] = (cleaned[k] as string).trim() || null;
    }
    if (typeof cleaned.unit === 'string') {
      cleaned.unit = cleaned.unit.trim();
      if (!cleaned.unit) throw new BadRequestException('计量单位不能为空');
    }
    return super.update(id, cleaned, expectedVersion);
  }
}
