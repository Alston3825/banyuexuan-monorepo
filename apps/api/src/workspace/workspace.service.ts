import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContextService } from '../common/context/request-context.service';
import { DataScopeService } from '../common/scope/data-scope.service';
import { WorkflowQueryService } from '../workflow/workflow-engine/workflow-query.service';

export type TodoKind = 'APPROVAL' | 'REJECTED' | 'EXPIRY' | 'OUTREACH' | 'COLLECT' | 'PURCHASE' | 'RECEIVE';
export type TodoLevel = 'danger' | 'warning' | 'info';

export interface TodoItem {
  key: string;
  kind: TodoKind;
  title: string;
  desc: string;
  link: string;
  /** 处理时限 / 到期时间（没有则为空） */
  dueAt: Date | null;
  overdue: boolean;
  level: TodoLevel;
  /** 排序用：越小越急 */
  sortAt: number;
}

const DAY = 86400_000;
/** 采购各环节的处理时限（小时），超过算“已超时”在待办里标红。以后需要可挪到参数配置里。 */
const PROCUREMENT_SLA_HOURS = { collect: 24, convert: 24, purchase: 72, receive: 168 };
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/** 我的待办：把“需要当前登录人处理”的事情汇总到一处（审批、被驳回、证件到期、回访任务），带时效提醒。 */
@Injectable()
export class WorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContextService,
    private readonly dataScope: DataScopeService,
    private readonly workflowQuery: WorkflowQueryService,
  ) {}

  async todos() {
    const items: TodoItem[] = [];
    const me = this.ctx.accountId!;
    const tenantId = this.ctx.tenantId!;

    // 1) 待我审批（含处理时限/超时/被催办）
    for (const r of await this.workflowQuery.pendingForMe(100)) {
      const level: TodoLevel = r.overdue ? 'danger' : r.urgeCount > 0 ? 'warning' : 'info';
      const parts = [`${r.initiatorName} 提交`, `当前节点：${r.nodeName}`];
      if (r.urgeCount > 0) parts.push(`已被催办 ${r.urgeCount} 次`);
      items.push({
        key: `approval:${r.instanceId}`,
        kind: 'APPROVAL',
        title: `待审批：${r.businessLabel} ${r.title}`,
        desc: parts.join(' · '),
        link: `/workflow/instances/${r.instanceId}`,
        dueAt: r.dueAt,
        overdue: r.overdue,
        level,
        sortAt: r.dueAt ? r.dueAt.getTime() : r.arrivedAt.getTime() + 30 * DAY,
      });
    }

    // 2) 我发起的申请被驳回（7 天内）
    const rejected = await this.prisma.workflowInstance.findMany({
      where: { tenantId, initiatorId: me, status: 'REJECTED', finishedAt: { gte: new Date(Date.now() - 7 * DAY) } },
      orderBy: { finishedAt: 'desc' },
      take: 20,
    });
    for (const r of rejected) {
      items.push({
        key: `rejected:${r.id}`,
        kind: 'REJECTED',
        title: `被驳回：${r.title}`,
        desc: '你提交的申请没有通过，点开查看驳回意见，修改后可重新提交',
        link: `/workflow/instances/${r.id}`,
        dueAt: null,
        overdue: false,
        level: 'warning',
        sortAt: (r.finishedAt?.getTime() ?? Date.now()) + 7 * DAY,
      });
    }

    // 3) 员工证件/合同/转正到期（30 天内或已过期；需要有员工档案查看权限）
    if (await this.ctx.hasPermission('hr.employee-profile.view')) {
      const limit = new Date(Date.now() + 30 * DAY);
      const profiles = await this.prisma.employeeProfile.findMany({
        where: {
          tenantId,
          archivedAt: null,
          OR: [{ healthCertExpiresAt: { lte: limit } }, { contractExpiresAt: { lte: limit } }, { probationEndsAt: { lte: limit, gte: startOfToday() } }],
        },
        include: { account: { select: { realName: true } } },
        take: 100,
      });
      const today = startOfToday().getTime();
      const push = (p: (typeof profiles)[number], label: string, at: Date | null, allowPast = true) => {
        if (!at || at > limit || (!allowPast && at.getTime() < today)) return;
        const days = Math.ceil((at.getTime() - today) / DAY);
        const overdue = days < 0;
        items.push({
          key: `expiry:${p.id}:${label}`,
          kind: 'EXPIRY',
          title: `${p.account.realName} 的${label}${overdue ? `已过期 ${-days} 天` : days === 0 ? '今天到期' : `${days} 天后到期`}`,
          desc: `到期日 ${at.toISOString().slice(0, 10)}，请及时办理${label === '转正' ? '转正手续' : '续办'}`,
          link: '/hr/employee-profiles',
          dueAt: at,
          overdue,
          level: overdue || days <= 7 ? 'danger' : 'warning',
          sortAt: at.getTime(),
        });
      };
      for (const p of profiles) {
        push(p, '健康证', p.healthCertExpiresAt);
        push(p, '劳动合同', p.contractExpiresAt);
        push(p, '转正', p.probationEndsAt, false);
      }
    }

    // 4) 今天及以前该做的回访任务（离店后关怀）
    if (await this.ctx.hasPermission('care.outreach-plan.view')) {
      const allowed = await this.dataScope.resolveAllowedStoreIds(this.ctx);
      const tasks = await this.prisma.careOutreachTask.findMany({
        where: { tenantId, status: 'PENDING', scheduledDate: { lt: new Date(startOfToday().getTime() + DAY) }, storeId: allowed === 'ALL' ? undefined : { in: allowed } },
        include: { plan: { include: { motherProfile: { include: { customer: { select: { name: true } } } } } } },
        orderBy: { scheduledDate: 'asc' },
        take: 100,
      });
      for (const t of tasks) {
        const overdue = t.scheduledDate.getTime() < startOfToday().getTime();
        items.push({
          key: `outreach:${t.id}`,
          kind: 'OUTREACH',
          title: `回访：${t.plan.motherProfile.customer.name} · ${t.title}`,
          desc: `计划 ${t.scheduledDate.toISOString().slice(0, 10)}${overdue ? '，已逾期未回访' : '，今天要回访'}`,
          link: '/care/outreach-tasks',
          dueAt: t.scheduledDate,
          overdue,
          level: overdue ? 'danger' : 'warning',
          sortAt: t.scheduledDate.getTime(),
        });
      }
    }

    // 5) 采购流程：客服待汇总的部门申购单 / 已批准待生成采购单 / 采购员待采购 / 客服待收货
    items.push(...(await this.procurementTodos()));

    items.sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.sortAt - b.sortAt);
    const count = (k: TodoKind) => items.filter((i) => i.kind === k).length;
    return {
      total: items.length,
      overdue: items.filter((i) => i.overdue).length,
      byKind: {
        APPROVAL: count('APPROVAL'),
        REJECTED: count('REJECTED'),
        EXPIRY: count('EXPIRY'),
        OUTREACH: count('OUTREACH'),
        COLLECT: count('COLLECT'),
        PURCHASE: count('PURCHASE'),
        RECEIVE: count('RECEIVE'),
      },
      items,
    };
  }

  /** 采购流程各环节“轮到我”的待办（按权限点判断我是哪个岗位）。超过时限（见 PROCUREMENT_SLA_HOURS）算已超时。 */
  private async procurementTodos(): Promise<TodoItem[]> {
    const out: TodoItem[] = [];
    const tenantId = this.ctx.tenantId!;
    const allowed = await this.dataScope.resolveAllowedStoreIds(this.ctx);
    const storeFilter = allowed === 'ALL' ? undefined : { in: allowed };
    const hours = (d: Date) => (Date.now() - d.getTime()) / 3600_000;
    const wait = (d: Date) => (hours(d) < 1 ? '刚收到' : hours(d) < 48 ? `已等 ${Math.floor(hours(d))} 小时` : `已等 ${Math.floor(hours(d) / 24)} 天`);
    const money = (n: unknown) => Number(n).toFixed(2);

    if (await this.ctx.hasPermission('inventory.purchase-request.collect')) {
      const pending = await this.prisma.purchaseRequest.findMany({
        where: { tenantId, storeId: storeFilter, kind: 'DEPARTMENT', status: 'SUBMITTED' },
        select: { departmentName: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      });
      if (pending.length) {
        const oldest = pending[0].createdAt;
        const overdue = hours(oldest) > PROCUREMENT_SLA_HOURS.collect;
        out.push({
          key: 'collect',
          kind: 'COLLECT',
          title: `${pending.length} 张部门申购单待汇总`,
          desc: `来自：${[...new Set(pending.map((p) => p.departmentName ?? '未填部门'))].join('、')} · 最早的${wait(oldest)}`,
          link: '/inventory/purchase-requests?tab=dept',
          dueAt: new Date(oldest.getTime() + PROCUREMENT_SLA_HOURS.collect * 3600_000),
          overdue,
          level: overdue ? 'danger' : 'info',
          sortAt: oldest.getTime(),
        });
      }
    }

    if (await this.ctx.hasPermission('inventory.purchase-request.convert')) {
      // 店长已批准、还没生成采购单的汇总申购单（状态可能还停在“审批中”，以审批实例为准）
      const approvedInstances = await this.prisma.workflowInstance.findMany({
        where: { tenantId, businessType: 'PURCHASE_REQUEST', status: { in: ['APPROVED', 'ARCHIVED'] } },
        select: { businessId: true, finishedAt: true },
      });
      const finished = new Map(approvedInstances.map((i) => [i.businessId, i.finishedAt]));
      const reqs = await this.prisma.purchaseRequest.findMany({
        where: { tenantId, storeId: storeFilter, kind: 'SUMMARY', status: { in: ['PENDING_APPROVAL', 'APPROVED'] }, id: { in: [...finished.keys()] } },
        select: { id: true, requestNo: true, totalAmount: true, updatedAt: true },
      });
      for (const r of reqs) {
        const since = finished.get(r.id) ?? r.updatedAt;
        const overdue = hours(since) > PROCUREMENT_SLA_HOURS.convert;
        out.push({
          key: `convert:${r.id}`,
          kind: 'PURCHASE',
          title: `店长已批准，待生成采购单：${r.requestNo}`,
          desc: `合计 ${money(r.totalAmount)} 元 · ${wait(since)}。点开选供应商和仓库，生成采购单后无需再审批`,
          link: '/inventory/purchase-requests',
          dueAt: new Date(since.getTime() + PROCUREMENT_SLA_HOURS.convert * 3600_000),
          overdue,
          level: overdue ? 'danger' : 'info',
          sortAt: since.getTime(),
        });
      }
    }

    if (await this.ctx.hasPermission('inventory.purchase-order.purchase')) {
      const orders = await this.prisma.purchaseOrder.findMany({
        where: { tenantId, storeId: storeFilter, status: 'APPROVED' },
        include: { supplier: { select: { name: true } } },
        orderBy: { updatedAt: 'asc' },
      });
      for (const o of orders) {
        const overdue = hours(o.updatedAt) > PROCUREMENT_SLA_HOURS.purchase;
        out.push({
          key: `purchase:${o.id}`,
          kind: 'PURCHASE',
          title: `待采购：${o.orderNo}（${o.supplier.name}）`,
          desc: `合计 ${(o.totalAmount / 100).toFixed(2)} 元 · ${wait(o.updatedAt)}。采购完成后点“确认采购”，系统自动生成入库单`,
          link: '/inventory/purchase-orders',
          dueAt: new Date(o.updatedAt.getTime() + PROCUREMENT_SLA_HOURS.purchase * 3600_000),
          overdue,
          level: overdue ? 'danger' : 'info',
          sortAt: o.updatedAt.getTime(),
        });
      }
    }

    if (await this.ctx.hasPermission('inventory.goods-receipt.receive')) {
      const receipts = await this.prisma.goodsReceipt.findMany({
        where: { tenantId, storeId: storeFilter, tracked: true, status: { in: ['PENDING_RECEIPT', 'PARTIALLY_RECEIVED'] } },
        include: { items: { select: { quantity: true, receivedQuantity: true } }, purchaseOrder: { select: { orderNo: true, purchasedAt: true } } },
        orderBy: { createdAt: 'asc' },
      });
      for (const r of receipts) {
        const left = r.items.filter((i) => i.receivedQuantity < i.quantity).length;
        const since = r.purchaseOrder?.purchasedAt ?? r.createdAt;
        const overdue = hours(since) > PROCUREMENT_SLA_HOURS.receive;
        out.push({
          key: `receive:${r.id}`,
          kind: 'RECEIVE',
          title: `待收货：${r.receiptNo}${r.purchaseOrder ? `（采购单 ${r.purchaseOrder.orderNo}）` : ''}`,
          desc: `还有 ${left} 项没到齐 · 采购完成${wait(since)}。快递到了就点开逐项确认收货`,
          link: '/inventory/goods-receipts',
          dueAt: new Date(since.getTime() + PROCUREMENT_SLA_HOURS.receive * 3600_000),
          overdue,
          level: overdue ? 'danger' : r.status === 'PARTIALLY_RECEIVED' ? 'warning' : 'info',
          sortAt: since.getTime(),
        });
      }
    }
    return out;
  }

  /** 顶栏小红点用：只数数量（轻量）。 */
  async badge() {
    const t = await this.todos();
    return { total: t.total, overdue: t.overdue };
  }
}
