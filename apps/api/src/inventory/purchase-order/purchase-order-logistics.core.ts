import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EXPRESS_COMPANIES, Kuaidi100Client, LOGISTICS_FINAL_STATES, LOGISTICS_STATE_LABEL } from './kuaidi100.client';

const AUTO_REFRESH_EVERY_MS = 30 * 60_000;
const AUTO_REFRESH_MAX_AGE_DAYS = 45;

type OrderLogisticsRow = {
  id: string;
  platform: string | null;
  platformOrderNo: string | null;
  expressNo: string | null;
  expressCompany: string | null;
  expressPhoneTail: string | null;
  logisticsState: number | null;
  logisticsTrace: unknown;
  logisticsCheckedAt: Date | null;
  logisticsError: string | null;
};

/**
 * 物流查询的“内核”（单例，不依赖登录上下文）：查快递100、写回采购单、每 30 分钟自动刷新。
 * 页面上登记单号/手动刷新走 PurchaseOrderLogisticsService（带权限和审计），都用这里的方法。
 */
@Injectable()
export class PurchaseOrderLogisticsCore implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PurchaseOrderLogisticsCore.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: Kuaidi100Client,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || !this.client.isConfigured()) return;
    this.timer = setInterval(() => void this.autoRefresh(), AUTO_REFRESH_EVERY_MS);
    this.timer.unref?.();
    this.logger.log('快递100 物流自动刷新已开启（每 30 分钟）');
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async refreshOrder(id: string, throwOnError: boolean) {
    const o = await this.prisma.purchaseOrder.findUniqueOrThrow({ where: { id } });
    if (!o.expressNo || !o.expressCompany) throw new BadRequestException('请先填写快递公司和快递单号');
    try {
      const r = await this.client.query(o.expressCompany, o.expressNo, o.expressPhoneTail);
      const updated = await this.prisma.purchaseOrder.update({
        where: { id },
        data: { logisticsState: r.state, logisticsTrace: r.events as unknown as Prisma.InputJsonValue, logisticsCheckedAt: new Date(), logisticsError: null },
      });
      return this.view(updated);
    } catch (e) {
      const msg = ((e as Error).message ?? '查询失败').slice(0, 250);
      await this.prisma.purchaseOrder.update({ where: { id }, data: { logisticsCheckedAt: new Date(), logisticsError: msg } });
      if (throwOnError) throw e;
      return this.view(await this.prisma.purchaseOrder.findUniqueOrThrow({ where: { id } }));
    }
  }

  /** 定时：把还没签收的已发货采购单刷新一遍（一张张查，间隔 1 秒，别打爆接口） */
  async autoRefresh(): Promise<number> {
    const since = new Date(Date.now() - AUTO_REFRESH_MAX_AGE_DAYS * 86_400_000);
    const rows = await this.prisma.purchaseOrder.findMany({
      where: { status: 'PURCHASED', expressNo: { not: null }, expressCompany: { not: null }, purchasedAt: { gte: since }, OR: [{ logisticsState: null }, { logisticsState: { notIn: LOGISTICS_FINAL_STATES } }] },
      select: { id: true },
      take: 200,
    });
    let n = 0;
    for (const r of rows) {
      try {
        await this.refreshOrder(r.id, false);
        n += 1;
      } catch (e) {
        this.logger.warn(`自动刷新物流失败 ${r.id}：${(e as Error).message}`);
      }
      if (process.env.NODE_ENV !== 'test') await new Promise((res) => setTimeout(res, 1000));
    }
    return n;
  }

  view(o: OrderLogisticsRow) {
    return {
      id: o.id,
      platform: o.platform,
      platformOrderNo: o.platformOrderNo,
      expressNo: o.expressNo,
      expressCompany: o.expressCompany,
      expressCompanyName: EXPRESS_COMPANIES.find((c) => c.code === o.expressCompany)?.name ?? o.expressCompany,
      expressPhoneTail: o.expressPhoneTail,
      logisticsState: o.logisticsState,
      logisticsStateLabel: o.logisticsState === null ? null : (LOGISTICS_STATE_LABEL[o.logisticsState] ?? `状态${o.logisticsState}`),
      trace: Array.isArray(o.logisticsTrace) ? o.logisticsTrace : [],
      checkedAt: o.logisticsCheckedAt,
      error: o.logisticsError,
    };
  }
}
