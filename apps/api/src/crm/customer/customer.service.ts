import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Customer, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { generateBusinessNo } from '../../common/utils/business-no.util';
import { QueryCustomerDto } from './dto/query-customer.dto';

/**
 * 客户主数据：租户全局共享，不做门店级数据隔离（已与业务方确认）——
 * 只按 tenantId 过滤，不调用 DataScopeService 做门店范围收窄，任何持有
 * crm.customer.view 权限点的账号都能看到全部客户。
 */
@Injectable()
export class CustomerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  findMany(query: QueryCustomerDto): Promise<Customer[]> {
    const where: Prisma.CustomerWhereInput = {
      tenantId: this.ctx.tenantId,
      assignedToId: query.assignedToId,
      primaryStoreId: query.primaryStoreId,
      ...(query.keyword
        ? {
            OR: [
              { name: { contains: query.keyword } },
              { phone: { contains: query.keyword } },
            ],
          }
        : {}),
    };
    return this.prisma.customer.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async findOneOrThrow(id: string): Promise<Customer> {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException(`Customer ${id} 不存在`);
    return customer;
  }

  async create(data: {
    name: string;
    phone: string;
    source: Customer['source'];
    primaryStoreId?: string;
    assignedToId?: string;
    remark?: string;
  }): Promise<Customer> {
    const created = await this.prisma.customer.create({
      data: {
        ...data,
        assignedToId: data.assignedToId ?? this.ctx.accountId,
        customerNo: generateBusinessNo('C'),
        tenantId: this.ctx.tenantId!,
        createdBy: this.ctx.accountId!,
      },
    });
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'Customer',
      entityId: created.id,
      afterData: created,
      ...this.auditCtx(),
    });
    return created;
  }

  async update(
    id: string,
    data: { name?: string; phone?: string; assignedToId?: string; remark?: string },
    expectedVersion: number,
  ): Promise<Customer> {
    const before = await this.findOneOrThrow(id);
    if (before.version !== expectedVersion) {
      throw new ConflictException('数据已被他人修改，请刷新后重试');
    }
    const updated = await this.prisma.customer.update({
      where: { id },
      data: { ...data, version: { increment: 1 } },
    });
    await this.auditLogService.record({
      action: 'UPDATE',
      entityType: 'Customer',
      entityId: id,
      beforeData: before,
      afterData: updated,
      changedFields: Object.keys(data),
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
