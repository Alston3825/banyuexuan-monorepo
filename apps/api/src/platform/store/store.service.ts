import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Store } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { DataScopeService } from '../../common/scope/data-scope.service';
import { generateBusinessNo } from '../../common/utils/business-no.util';
import { runVersionedUpdate } from '../../common/utils/versioned-update.util';

@Injectable()
export class StoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dataScopeService: DataScopeService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  async findMany(): Promise<Store[]> {
    const allowed = await this.dataScopeService.resolveAllowedStoreIds(this.ctx);
    return this.prisma.store.findMany({
      where: allowed === 'ALL' ? {} : { id: { in: allowed } },
    });
  }

  async findOneOrThrow(id: string): Promise<Store> {
    const store = await this.prisma.store.findUnique({ where: { id } });
    if (!store) throw new NotFoundException(`Store ${id} 不存在`);
    return store;
  }

  async create(data: { code?: string; name: string; regionId: string; address?: string }): Promise<Store> {
    const created = await this.prisma.store.create({
      data: {
        ...data,
        code: data.code ?? generateBusinessNo('ST'),
        tenantId: this.ctx.tenantId!,
        createdBy: this.ctx.accountId!,
        status: 'ACTIVE',
      },
    });
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'Store',
      entityId: created.id,
      afterData: created,
      ...this.auditCtx(),
    });
    return created;
  }

  async update(
    id: string,
    data: { name?: string; address?: string; status?: 'PENDING' | 'ACTIVE' | 'CLOSED' },
    expectedVersion: number,
  ): Promise<Store> {
    const before = await this.findOneOrThrow(id);
    await this.dataScopeService.assertStoreAccessible(this.ctx, id);
    if (before.version !== expectedVersion) {
      throw new ConflictException('数据已被他人修改，请刷新后重试');
    }
    const updated = await runVersionedUpdate(() =>
      this.prisma.store.update({
        where: { id, version: expectedVersion },
        data: { ...data, version: { increment: 1 } },
      }),
    );
    await this.auditLogService.record({
      action: 'UPDATE',
      entityType: 'Store',
      entityId: id,
      beforeData: before,
      afterData: updated,
      changedFields: Object.keys(data),
      ...this.auditCtx(),
    });
    return updated;
  }

  /** 门店不允许物理删除，只能作废（转 CLOSED），符合审计总则"关键记录只允许冲正/作废"。 */
  async close(id: string, expectedVersion: number): Promise<Store> {
    const before = await this.findOneOrThrow(id);
    await this.dataScopeService.assertStoreAccessible(this.ctx, id);
    if (before.version !== expectedVersion) {
      throw new ConflictException('数据已被他人修改，请刷新后重试');
    }
    const updated = await runVersionedUpdate(() =>
      this.prisma.store.update({
        where: { id, version: expectedVersion },
        data: { status: 'CLOSED', version: { increment: 1 } },
      }),
    );
    await this.auditLogService.record({
      action: 'VOID',
      entityType: 'Store',
      entityId: id,
      beforeData: before,
      afterData: updated,
      ...this.auditCtx(),
    });
    return updated;
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
