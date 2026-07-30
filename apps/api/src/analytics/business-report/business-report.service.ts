import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { DataScopeService } from '../../common/scope/data-scope.service';
import { QueryBusinessReportDto } from './dto/query-business-report.dto';

export interface FinanceSummary {
  storeScope: string; // 具体门店id，或'ALL'代表汇总多个门店
  paymentTotalAmount: number; // RECORDED+PENDING_REFUND 之和（分），钱仍在中心账上
  paymentRefundedAmount: number; // REFUNDED 之和（分）
  paymentByMethod: { method: string; amount: number }[];
  accountRechargeAmount: number;
  accountConsumeAmount: number;
  accountRefundAmount: number;
  accountAdjustAmount: number;
  accountCurrentBalance: number; // 当前余额快照（本金+赠送），不受日期区间限制
}

export interface OccupancyDailyPoint {
  date: string; // YYYY-MM-DD
  occupiedRooms: number;
  totalRooms: number;
  occupancyRate: number; // 0~1
}

export interface OccupancySummary {
  storeScope: string;
  totalRooms: number;
  averageOccupancyRate: number;
  daily: OccupancyDailyPoint[];
}

/**
 * 经营分析看板聚合查询：不落库，每次实时聚合，同月子餐/产康结算报表口径一致
 * （见业务规则确认记录"P5经营分析看板实现中"）。财务数据敏感度更高，门店范围用
 * DataScopeService强制收紧（店长限自己门店），不同于其他报表"传什么storeId查什么店"的口径。
 */
@Injectable()
export class BusinessReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dataScopeService: DataScopeService,
    private readonly ctx: RequestContextService,
  ) {}

  async getFinanceSummary(query: QueryBusinessReportDto): Promise<FinanceSummary> {
    const scope = await this.resolveStoreScope(query.storeId);
    const { start, endExclusive } = this.dateRange(query.startDate, query.endDate);

    const payments = await this.prisma.payment.findMany({
      where: { tenantId: this.ctx.tenantId, ...scope.where, createdAt: { gte: start, lt: endExclusive } },
      select: { amount: true, method: true, status: true },
    });
    let paymentTotalAmount = 0;
    let paymentRefundedAmount = 0;
    const byMethodMap = new Map<string, number>();
    for (const p of payments) {
      if (p.status === 'REFUNDED') {
        paymentRefundedAmount += p.amount;
      } else {
        paymentTotalAmount += p.amount;
        byMethodMap.set(p.method, (byMethodMap.get(p.method) ?? 0) + p.amount);
      }
    }

    const customerStoreWhere =
      scope.storeIds === undefined ? {} : scope.storeIds.length === 1 ? { primaryStoreId: scope.storeIds[0] } : { primaryStoreId: { in: scope.storeIds } };

    const transactions = await this.prisma.customerAccountTransaction.findMany({
      where: { tenantId: this.ctx.tenantId, createdAt: { gte: start, lt: endExclusive }, account: { customer: customerStoreWhere } },
      select: { type: true, principalDelta: true, giftDelta: true },
    });
    let accountRechargeAmount = 0;
    let accountConsumeAmount = 0;
    let accountRefundAmount = 0;
    let accountAdjustAmount = 0;
    for (const t of transactions) {
      const delta = Math.abs(t.principalDelta + t.giftDelta);
      if (t.type === 'RECHARGE') accountRechargeAmount += delta;
      else if (t.type === 'CONSUME') accountConsumeAmount += delta;
      else if (t.type === 'REFUND') accountRefundAmount += delta;
      else if (t.type === 'ADJUST') accountAdjustAmount += delta;
    }

    const accounts = await this.prisma.customerAccount.findMany({
      where: { tenantId: this.ctx.tenantId, customer: customerStoreWhere },
      select: { principalBalance: true, giftBalance: true },
    });
    const accountCurrentBalance = accounts.reduce((sum, a) => sum + a.principalBalance + a.giftBalance, 0);

    return {
      storeScope: scope.label,
      paymentTotalAmount,
      paymentRefundedAmount,
      paymentByMethod: Array.from(byMethodMap.entries()).map(([method, amount]) => ({ method, amount })),
      accountRechargeAmount,
      accountConsumeAmount,
      accountRefundAmount,
      accountAdjustAmount,
      accountCurrentBalance,
    };
  }

  async getOccupancySummary(query: QueryBusinessReportDto): Promise<OccupancySummary> {
    const scope = await this.resolveStoreScope(query.storeId);
    const totalRooms = await this.prisma.room.count({ where: { tenantId: this.ctx.tenantId, ...scope.where } });

    const { start, endExclusive } = this.dateRange(query.startDate, query.endDate);
    const daily: OccupancyDailyPoint[] = [];
    for (let day = new Date(start); day < endExclusive; day.setUTCDate(day.getUTCDate() + 1)) {
      const dayStart = new Date(day);
      const dayEnd = new Date(day);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

      const occupiedRooms = await this.prisma.roomOccupancy.count({
        where: {
          tenantId: this.ctx.tenantId,
          ...(scope.storeIds === undefined ? {} : scope.storeIds.length === 1 ? { storeId: scope.storeIds[0] } : { storeId: { in: scope.storeIds } }),
          actualCheckInAt: { lt: dayEnd },
          OR: [{ actualCheckOutAt: null }, { actualCheckOutAt: { gt: dayStart } }],
        },
      });
      daily.push({
        date: dayStart.toISOString().slice(0, 10),
        occupiedRooms,
        totalRooms,
        occupancyRate: totalRooms > 0 ? occupiedRooms / totalRooms : 0,
      });
    }

    const averageOccupancyRate = daily.length > 0 ? daily.reduce((sum, d) => sum + d.occupancyRate, 0) / daily.length : 0;

    return { storeScope: scope.label, totalRooms, averageOccupancyRate, daily };
  }

  private async resolveStoreScope(storeId?: string): Promise<{ where: { storeId?: string | { in: string[] } }; storeIds?: string[]; label: string }> {
    if (storeId) {
      await this.dataScopeService.assertStoreAccessible(this.ctx, storeId);
      return { where: { storeId }, storeIds: [storeId], label: storeId };
    }
    const allowed = await this.dataScopeService.resolveAllowedStoreIds(this.ctx);
    if (allowed === 'ALL') return { where: {}, storeIds: undefined, label: 'ALL' };
    if (allowed.length === 1) return { where: { storeId: allowed[0] }, storeIds: allowed, label: allowed[0] };
    return { where: { storeId: { in: allowed } }, storeIds: allowed, label: 'ALL' };
  }

  private dateRange(startDate: string, endDate: string): { start: Date; endExclusive: Date } {
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const endExclusive = new Date(`${endDate}T00:00:00.000Z`);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    return { start, endExclusive };
  }
}
