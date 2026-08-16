import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Lead, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { generateBusinessNo } from '../../common/utils/business-no.util';
import { runVersionedUpdate } from '../../common/utils/versioned-update.util';
import { CustomerService } from '../customer/customer.service';
import { QueryLeadDto } from './dto/query-lead.dto';

/**
 * 线索：租户全局共享，不做门店级数据隔离（同 CustomerService，已与业务方确认）。
 * 状态机：NEW -> ASSIGNED -> FOLLOWING -> CONVERTED；LOST 可从 NEW/ASSIGNED/FOLLOWING 到达。
 * ASSIGNED -> FOLLOWING 是"创建第一条跟进记录"的副作用，见 markFollowing()，
 * 由 FollowUpService 在校验通过后调用，不单独开转态接口。
 */
@Injectable()
export class LeadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerService: CustomerService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  findMany(query: QueryLeadDto): Promise<Lead[]> {
    const where: Prisma.LeadWhereInput = {
      tenantId: this.ctx.tenantId,
      status: query.status,
      assignedToId: query.assignedToId,
      storeId: query.storeId,
    };
    return this.prisma.lead.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async findOneOrThrow(id: string): Promise<Lead> {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException(`Lead ${id} 不存在`);
    return lead;
  }

  async create(data: {
    name: string;
    phone: string;
    source: Lead['source'];
    storeId?: string;
    remark?: string;
  }): Promise<Lead> {
    const created = await this.prisma.lead.create({
      data: {
        ...data,
        leadNo: generateBusinessNo('L'),
        status: 'NEW',
        tenantId: this.ctx.tenantId!,
        createdBy: this.ctx.accountId!,
      },
    });
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'Lead',
      entityId: created.id,
      afterData: created,
      ...this.auditCtx(),
    });
    return created;
  }

  async update(
    id: string,
    data: { name?: string; phone?: string; remark?: string },
    expectedVersion: number,
  ): Promise<Lead> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    const updated = await runVersionedUpdate(() =>
      this.prisma.lead.update({
        where: { id, version: expectedVersion },
        data: { ...data, version: { increment: 1 } },
      }),
    );
    await this.auditLogService.record({
      action: 'UPDATE',
      entityType: 'Lead',
      entityId: id,
      beforeData: before,
      afterData: updated,
      changedFields: Object.keys(data),
      ...this.auditCtx(),
    });
    return updated;
  }

  /** 分配/转派负责人；首次分配（原状态 NEW）顺带推进状态到 ASSIGNED。 */
  async assign(id: string, assignedToId: string, expectedVersion: number): Promise<Lead> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (!['NEW', 'ASSIGNED', 'FOLLOWING'].includes(before.status)) {
      throw new BadRequestException(`线索当前状态「${before.status}」不允许分配`);
    }
    const isFirstAssignment = before.status === 'NEW';
    const updated = await runVersionedUpdate(() =>
      this.prisma.lead.update({
        where: { id, version: expectedVersion },
        data: {
          assignedToId,
          status: isFirstAssignment ? 'ASSIGNED' : before.status,
          version: { increment: 1 },
        },
      }),
    );
    await this.auditLogService.record({
      action: isFirstAssignment ? 'STATE_TRANSITION' : 'REASSIGN',
      entityType: 'Lead',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: isFirstAssignment ? 'NEW -> ASSIGNED' : `改派给 ${assignedToId}`,
      ...this.auditCtx(),
    });
    return updated;
  }

  /** 由 FollowUpService 在确认线索处于 ASSIGNED 状态后调用，推进到 FOLLOWING；已是 FOLLOWING 则不做任何事。 */
  async markFollowing(id: string): Promise<void> {
    const before = await this.findOneOrThrow(id);
    if (before.status !== 'ASSIGNED') return;
    const updated = await this.prisma.lead.update({
      where: { id },
      data: { status: 'FOLLOWING', version: { increment: 1 } },
    });
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'Lead',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: 'ASSIGNED -> FOLLOWING（首次跟进）',
      ...this.auditCtx(),
    });
  }

  /** 转化建档：仅允许从 ASSIGNED/FOLLOWING（保证有 assignedToId 可带到新客户上）。 */
  async convert(id: string, expectedVersion: number) {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (!['ASSIGNED', 'FOLLOWING'].includes(before.status)) {
      throw new BadRequestException(`线索当前状态「${before.status}」不允许转化建档`);
    }
    const customer = await this.customerService.create({
      name: before.name,
      phone: before.phone,
      source: before.source,
      primaryStoreId: before.storeId ?? undefined,
      assignedToId: before.assignedToId ?? undefined,
    });
    const updated = await runVersionedUpdate(() =>
      this.prisma.lead.update({
        where: { id, version: expectedVersion },
        data: { status: 'CONVERTED', customerId: customer.id, version: { increment: 1 } },
      }),
    );
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'Lead',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: `CONVERTED -> Customer ${customer.id}`,
      ...this.auditCtx(),
    });
    return { lead: updated, customer };
  }

  async lose(id: string, lostReason: string, expectedVersion: number): Promise<Lead> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (!['NEW', 'ASSIGNED', 'FOLLOWING'].includes(before.status)) {
      throw new BadRequestException(`线索当前状态「${before.status}」不允许标记流失`);
    }
    const updated = await runVersionedUpdate(() =>
      this.prisma.lead.update({
        where: { id, version: expectedVersion },
        data: { status: 'LOST', lostReason, version: { increment: 1 } },
      }),
    );
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'Lead',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: `LOST: ${lostReason}`,
      ...this.auditCtx(),
    });
    return updated;
  }

  private assertVersion(before: Lead, expectedVersion: number): void {
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
