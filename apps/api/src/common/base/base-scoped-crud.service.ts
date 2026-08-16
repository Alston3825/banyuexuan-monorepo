import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../context/request-context.service';

/** 通用 Prisma delegate 形状（有意保持宽松类型，避免为每个模型单独做泛型体操）。 */
export interface ScopedCrudDelegate {
  findMany(args?: unknown): Promise<any[]>;
  findUnique(args: unknown): Promise<any | null>;
  create(args: unknown): Promise<any>;
  update(args: unknown): Promise<any>;
  delete(args: unknown): Promise<any>;
}

interface ScopedEntity {
  id: string;
  version: number;
}

/**
 * region/department/team/position/tag/parameter 等简单平台子模块复用的基类：
 * 统一处理乐观锁校验（version）与审计日志记录，避免每个子模块重复样板代码。
 */
export abstract class BaseScopedCrudService<T extends ScopedEntity> {
  protected abstract readonly entityType: string;
  protected abstract readonly delegate: ScopedCrudDelegate;

  constructor(
    protected readonly auditLogService: AuditLogService,
    protected readonly ctx: RequestContextService,
  ) {}

  async findMany(where: Record<string, unknown> = {}): Promise<T[]> {
    return this.delegate.findMany({ where }) as Promise<T[]>;
  }

  async findOneOrThrow(id: string): Promise<T> {
    const record = await this.delegate.findUnique({ where: { id } });
    if (!record) throw new NotFoundException(`${this.entityType} ${id} 不存在`);
    return record;
  }

  async create(data: Record<string, unknown>): Promise<T> {
    const created = await this.delegate.create({
      data: { ...data, createdBy: this.ctx.accountId },
    });
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: this.entityType,
      entityId: created.id,
      afterData: created,
      ...this.auditContext(),
    });
    return created;
  }

  async update(id: string, data: Record<string, unknown>, expectedVersion: number): Promise<T> {
    const before = await this.findOneOrThrow(id);
    if (before.version !== expectedVersion) {
      throw new ConflictException('数据已被他人修改，请刷新后重试');
    }
    // where 里带上 version 条件，让"读取校验通过"和"落库"这两步之间的并发窗口也受数据库保护：
    // 两个并发请求都读到同一份旧数据、都通过上面的内存校验后，只有先到达数据库的那个 update
    // 能匹配到这一行（version 还是旧值）成功执行；后到达的因为 version 已被前者改掉而匹配不到
    // 任何行，Prisma 抛 P2025，在这里转换成和"内存校验不通过"一样的 409，而不是静默覆盖。
    let updated: T;
    try {
      updated = await this.delegate.update({
        where: { id, version: expectedVersion },
        data: { ...data, version: { increment: 1 } },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new ConflictException('数据已被他人修改，请刷新后重试');
      }
      throw err;
    }
    await this.auditLogService.record({
      action: 'UPDATE',
      entityType: this.entityType,
      entityId: id,
      beforeData: before,
      afterData: updated,
      changedFields: Object.keys(data),
      ...this.auditContext(),
    });
    return updated;
  }

  async delete(id: string): Promise<void> {
    const before = await this.findOneOrThrow(id);
    await this.delegate.delete({ where: { id } });
    await this.auditLogService.record({
      action: 'DELETE',
      entityType: this.entityType,
      entityId: id,
      beforeData: before,
      ...this.auditContext(),
    });
  }

  private auditContext() {
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
