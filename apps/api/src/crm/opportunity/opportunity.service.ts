import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OpportunityStage, Prisma, SalesOpportunity } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { generateBusinessNo } from '../../common/utils/business-no.util';
import { runVersionedUpdate } from '../../common/utils/versioned-update.util';
import { CustomerService } from '../customer/customer.service';
import { QueryOpportunityDto } from './dto/query-opportunity.dto';

const ALLOWED_ADVANCE: Record<string, OpportunityStage> = {
  FOLLOWING: 'QUOTED',
  QUOTED: 'WON',
};

/**
 * 销售机会：租户全局共享，不做门店级数据隔离（同 CustomerService，已与业务方确认）。
 * 状态机：FOLLOWING -> QUOTED -> WON（单向，一步一个台阶，不允许跳级）；
 * LOST 可从 FOLLOWING/QUOTED 到达，WON 为终态不可再转 LOST。
 */
@Injectable()
export class OpportunityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerService: CustomerService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  findMany(query: QueryOpportunityDto): Promise<SalesOpportunity[]> {
    const where: Prisma.SalesOpportunityWhereInput = {
      tenantId: this.ctx.tenantId,
      stage: query.stage,
      customerId: query.customerId,
      assignedToId: query.assignedToId,
    };
    return this.prisma.salesOpportunity.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async findOneOrThrow(id: string): Promise<SalesOpportunity> {
    const opportunity = await this.prisma.salesOpportunity.findUnique({ where: { id } });
    if (!opportunity) throw new NotFoundException(`SalesOpportunity ${id} 不存在`);
    return opportunity;
  }

  async create(data: {
    customerId: string;
    leadId?: string;
    amount?: number;
    assignedToId?: string;
    remark?: string;
  }): Promise<SalesOpportunity> {
    const customer = await this.customerService.findOneOrThrow(data.customerId);
    const created = await this.prisma.salesOpportunity.create({
      data: {
        ...data,
        assignedToId: data.assignedToId ?? customer.assignedToId ?? this.ctx.accountId,
        opportunityNo: generateBusinessNo('O'),
        stage: 'FOLLOWING',
        tenantId: this.ctx.tenantId!,
        createdBy: this.ctx.accountId!,
      },
    });
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'SalesOpportunity',
      entityId: created.id,
      afterData: created,
      ...this.auditCtx(),
    });
    return created;
  }

  async update(
    id: string,
    data: { amount?: number; assignedToId?: string; remark?: string },
    expectedVersion: number,
  ): Promise<SalesOpportunity> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    const updated = await runVersionedUpdate(() =>
      this.prisma.salesOpportunity.update({
        where: { id, version: expectedVersion },
        data: { ...data, version: { increment: 1 } },
      }),
    );
    await this.auditLogService.record({
      action: 'UPDATE',
      entityType: 'SalesOpportunity',
      entityId: id,
      beforeData: before,
      afterData: updated,
      changedFields: Object.keys(data),
      ...this.auditCtx(),
    });
    return updated;
  }

  async advanceStage(id: string, targetStage: 'QUOTED' | 'WON', expectedVersion: number): Promise<SalesOpportunity> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (ALLOWED_ADVANCE[before.stage] !== targetStage) {
      throw new BadRequestException(`销售机会当前阶段「${before.stage}」不允许流转到「${targetStage}」`);
    }
    const updated = await runVersionedUpdate(() =>
      this.prisma.salesOpportunity.update({
        where: { id, version: expectedVersion },
        data: { stage: targetStage, version: { increment: 1 } },
      }),
    );
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'SalesOpportunity',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: `${before.stage} -> ${targetStage}`,
      ...this.auditCtx(),
    });
    return updated;
  }

  async lose(id: string, lostReason: string, expectedVersion: number): Promise<SalesOpportunity> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (!['FOLLOWING', 'QUOTED'].includes(before.stage)) {
      throw new BadRequestException(`销售机会当前阶段「${before.stage}」不允许标记流失`);
    }
    const updated = await runVersionedUpdate(() =>
      this.prisma.salesOpportunity.update({
        where: { id, version: expectedVersion },
        data: { stage: 'LOST', lostReason, version: { increment: 1 } },
      }),
    );
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'SalesOpportunity',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: `LOST: ${lostReason}`,
      ...this.auditCtx(),
    });
    return updated;
  }

  private assertVersion(before: SalesOpportunity, expectedVersion: number): void {
    if (before.version !== expectedVersion) {
      throw new ConflictException('数据已被他人修改，请刷新后重试');
    }
  }

  private auditCtx() {
    return {
      tenantId: this.ctx.tenantId,
      storeId: this.ctx.homeStoreId,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    };
  }
}
