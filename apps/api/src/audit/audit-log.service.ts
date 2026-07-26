import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface RecordAuditParams {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
  changedFields?: string[];
  result?: 'SUCCESS' | 'FAILURE';
  remark?: string;
  // 请求上下文（由调用方传入，通常来自 RequestContextService）
  tenantId?: string | null;
  storeId?: string | null;
  accountId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

/**
 * 审计日志服务：只增不改（不提供 update/delete 方法），符合审计总则
 * "关键记录只允许冲正/作废"——审计记录本身也不允许被修改或删除。
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(params: RecordAuditParams): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        beforeData: (params.beforeData as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        afterData: (params.afterData as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        changedFields: (params.changedFields as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        result: params.result ?? 'SUCCESS',
        remark: params.remark,
        tenantId: params.tenantId ?? null,
        storeId: params.storeId ?? null,
        accountId: params.accountId ?? null,
        ip: params.ip ?? null,
        userAgent: params.userAgent ?? null,
        requestId: params.requestId ?? null,
      },
    });
  }

  async findMany(filter: {
    tenantId?: string;
    entityType?: string;
    entityId?: string;
    accountId?: string;
    action?: AuditAction;
    from?: Date;
    to?: Date;
    page?: number;
    pageSize?: number;
  }) {
    const page = filter.page && filter.page > 0 ? filter.page : 1;
    const pageSize = filter.pageSize && filter.pageSize > 0 ? Math.min(filter.pageSize, 200) : 20;

    const where: Prisma.AuditLogWhereInput = {
      tenantId: filter.tenantId,
      entityType: filter.entityType,
      entityId: filter.entityId,
      accountId: filter.accountId,
      action: filter.action,
      createdAt:
        filter.from || filter.to
          ? { gte: filter.from, lte: filter.to }
          : undefined,
    };

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }
}
