import { Injectable, NotFoundException } from '@nestjs/common';
import { CustomerServicePackage } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { CreateCustomerServicePackageDto } from './dto/create-customer-service-package.dto';
import { QueryCustomerServicePackageDto } from './dto/query-customer-service-package.dto';

const includePackage = { package: true };

/** 客户购买服务包：remainingSessions 初始化=套餐总次数，后续由 ServiceAppointment 完成时递减。 */
@Injectable()
export class CustomerServicePackageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  findMany(query: QueryCustomerServicePackageDto = {}) {
    return this.prisma.customerServicePackage.findMany({
      where: { tenantId: this.ctx.tenantId, customerId: query.customerId, storeId: query.storeId },
      include: includePackage,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneOrThrow(id: string) {
    const record = await this.prisma.customerServicePackage.findUnique({ where: { id }, include: includePackage });
    if (!record) throw new NotFoundException(`CustomerServicePackage ${id} 不存在`);
    return record;
  }

  async create(dto: CreateCustomerServicePackageDto): Promise<CustomerServicePackage> {
    const [customer, pkg] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: dto.customerId } }),
      this.prisma.servicePackage.findUnique({ where: { id: dto.packageId } }),
    ]);
    if (!customer) throw new NotFoundException(`Customer ${dto.customerId} 不存在`);
    if (!pkg) throw new NotFoundException(`ServicePackage ${dto.packageId} 不存在`);

    const created = await this.prisma.customerServicePackage.create({
      data: {
        tenantId: this.ctx.tenantId!,
        storeId: dto.storeId,
        customerId: dto.customerId,
        packageId: dto.packageId,
        remainingSessions: pkg.totalSessions,
        amount: dto.amount,
        createdBy: this.ctx.accountId!,
      },
      include: includePackage,
    });
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'CustomerServicePackage',
      entityId: created.id,
      afterData: created,
      tenantId: this.ctx.tenantId,
      storeId: dto.storeId,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    });
    return created;
  }
}
