import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { EXPRESS_COMPANIES, Kuaidi100Client, LOGISTICS_STATE_LABEL } from './kuaidi100.client';
import { PurchaseOrderLogisticsCore } from './purchase-order-logistics.core';

export const PURCHASE_PLATFORMS = ['1688', 'TAOBAO', 'PDD', 'OTHER'] as const;

export interface LogisticsInfoInput {
  platform?: string | null;
  platformOrderNo?: string | null;
  expressNo?: string | null;
  expressCompany?: string | null;
  expressPhoneTail?: string | null;
}

/** 采购单的“采购平台 / 平台订单号 / 快递单号”登记和物流查看（带权限、审计）。查询和自动刷新在 PurchaseOrderLogisticsCore。 */
@Injectable()
export class PurchaseOrderLogisticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly ctx: RequestContextService,
    private readonly client: Kuaidi100Client,
    private readonly core: PurchaseOrderLogisticsCore,
  ) {}

  meta() {
    return { configured: this.client.isConfigured(), companies: EXPRESS_COMPANIES, platforms: PURCHASE_PLATFORMS, stateLabels: LOGISTICS_STATE_LABEL };
  }

  private async order(id: string) {
    const o = await this.prisma.purchaseOrder.findFirst({ where: { id, tenantId: this.ctx.tenantId } });
    if (!o) throw new NotFoundException('采购单不存在');
    return o;
  }

  /** 保存平台/单号信息；单号或快递公司变了，旧轨迹清掉；填全了就顺手查一次 */
  async updateInfo(id: string, dto: LogisticsInfoInput) {
    const o = await this.order(id);
    if (o.status === 'CANCELLED' || o.status === 'DRAFT') throw new BadRequestException('这张采购单当前状态不需要登记物流');
    const norm = (v?: string | null, max = 64) => (v === undefined ? undefined : (v?.trim().slice(0, max) || null));
    if (dto.platform && !(PURCHASE_PLATFORMS as readonly string[]).includes(dto.platform)) throw new BadRequestException('采购平台不在可选范围内');
    const phone = norm(dto.expressPhoneTail, 8);
    if (phone && !/^\d{4,11}$/.test(phone)) throw new BadRequestException('手机尾号请填 4 位数字（顺丰需要收件或寄件手机后四位）');
    const expressNo = norm(dto.expressNo, 100);
    const company = norm(dto.expressCompany, 40);
    const data: Prisma.PurchaseOrderUpdateInput = {};
    if (dto.platform !== undefined) data.platform = dto.platform || null;
    if (dto.platformOrderNo !== undefined) data.platformOrderNo = norm(dto.platformOrderNo);
    if (expressNo !== undefined) data.expressNo = expressNo;
    if (company !== undefined) data.expressCompany = company;
    if (phone !== undefined) data.expressPhoneTail = phone;
    const changedTrack = (expressNo !== undefined && expressNo !== o.expressNo) || (company !== undefined && company !== o.expressCompany);
    if (changedTrack) {
      data.logisticsState = null;
      data.logisticsTrace = Prisma.DbNull;
      data.logisticsCheckedAt = null;
      data.logisticsError = null;
    }
    await this.prisma.purchaseOrder.update({ where: { id }, data });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'PurchaseOrder',
      entityId: id,
      beforeData: { platform: o.platform, platformOrderNo: o.platformOrderNo, expressNo: o.expressNo, expressCompany: o.expressCompany },
      afterData: { platform: dto.platform, platformOrderNo: dto.platformOrderNo, expressNo, expressCompany: company },
      remark: '登记采购平台/物流单号',
      tenantId: this.ctx.tenantId,
      storeId: o.storeId,
      accountId: this.ctx.accountId,
      requestId: this.ctx.requestId,
    });
    const fresh = await this.order(id);
    if (fresh.expressNo && fresh.expressCompany && this.client.isConfigured() && changedTrack) return this.core.refreshOrder(fresh.id, false);
    return this.core.view(fresh);
  }

  /** 手动刷新物流 */
  async refresh(id: string) {
    const o = await this.order(id);
    return this.core.refreshOrder(o.id, true);
  }

  async get(id: string) {
    return this.core.view(await this.order(id));
  }
}
