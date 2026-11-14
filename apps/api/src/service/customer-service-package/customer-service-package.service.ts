import { Injectable, NotFoundException } from '@nestjs/common';
import { CustomerServicePackage } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { CreateCustomerServicePackageDto } from './dto/create-customer-service-package.dto';
import { QueryCustomerServicePackageDto } from './dto/query-customer-service-package.dto';
import { QueryCustomerServicePackageReportDto } from './dto/query-customer-service-package-report.dto';

const includePackage = { package: true };

export interface CustomerServicePackageReport {
  totalSold: number;
  totalAmount: number;
  activeCount: number;
  exhaustedCount: number;
  remainingSessionsTotal: number;
  byPackage: { packageId: string; name: string; soldCount: number; amount: number }[];
}

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

  /** 服务包销售汇总（P2交付物"膳食预算与产康结算的基础报表"）：本期只做数量/金额统计，不做分成结算。 */
  async report(query: QueryCustomerServicePackageReportDto = {}): Promise<CustomerServicePackageReport> {
    const packages = await this.prisma.customerServicePackage.findMany({
      where: {
        tenantId: this.ctx.tenantId,
        storeId: query.storeId,
        purchasedAt: {
          gte: query.startDate ? new Date(query.startDate) : undefined,
          lte: query.endDate ? new Date(query.endDate) : undefined,
        },
      },
      include: includePackage,
    });

    let totalAmount = 0;
    let activeCount = 0;
    let exhaustedCount = 0;
    let remainingSessionsTotal = 0;
    const byPackageMap = new Map<string, { name: string; soldCount: number; amount: number }>();

    for (const pkg of packages) {
      totalAmount += pkg.amount;
      remainingSessionsTotal += pkg.remainingSessions;
      if (pkg.status === 'ACTIVE') activeCount += 1;
      else exhaustedCount += 1;
      const existing = byPackageMap.get(pkg.packageId);
      if (existing) {
        existing.soldCount += 1;
        existing.amount += pkg.amount;
      } else {
        byPackageMap.set(pkg.packageId, { name: pkg.package.name, soldCount: 1, amount: pkg.amount });
      }
    }

    return {
      totalSold: packages.length,
      totalAmount,
      activeCount,
      exhaustedCount,
      remainingSessionsTotal,
      byPackage: [...byPackageMap.entries()]
        .map(([packageId, v]) => ({ packageId, name: v.name, soldCount: v.soldCount, amount: v.amount }))
        .sort((a, b) => b.soldCount - a.soldCount),
    };
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
