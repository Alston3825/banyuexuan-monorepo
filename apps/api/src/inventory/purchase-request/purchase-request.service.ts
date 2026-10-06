import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PurchaseRequest } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { ActorContext } from '../../common/context/actor-context';
import { DataScopeService } from '../../common/scope/data-scope.service';
import { runVersionedUpdate } from '../../common/utils/versioned-update.util';
import { WorkflowEngineService } from '../../workflow/workflow-engine/workflow-engine.service';
import { PurchaseOrderService } from '../purchase-order/purchase-order.service';
import { keyOf, norm } from '../inventory-item/inventory-item-import.service';

const DEFINITION_CODE = 'INVENTORY_PURCHASE_REQUEST';
const BUSINESS_TYPE = 'PURCHASE_REQUEST';
const include = {
  store: { select: { id: true, name: true } },
  purchaseOrder: { select: { id: true, orderNo: true, status: true } },
  items: { orderBy: { sortNo: 'asc' as const }, include: { item: { select: { id: true, code: true } } } },
};
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface RequestLineBody {
  name?: string;
  spec?: string | null;
  brand?: string | null;
  unit?: string | null;
  quantity?: number;
  unitPrice?: number | null;
  department?: string | null;
  requester?: string | null;
  purpose?: string | null;
  remark?: string | null;
  itemId?: string | null;
}

/**
 * 申购单(SG)：DRAFT -(提交)-> PENDING_APPROVAL -(通用工作流，店长审批)-> APPROVED/REJECTED；
 * APPROVED 后选供应商和仓库“生成采购单”→ ORDERED（采购单本身还要再走采购审批）。
 * 只有 DRAFT 能改明细。PENDING_APPROVAL 的后续推进与采购单一样，读取时懒同步自 WorkflowInstance。
 */
@Injectable()
export class PurchaseRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowEngineService: WorkflowEngineService,
    private readonly purchaseOrderService: PurchaseOrderService,
    private readonly auditLogService: AuditLogService,
    private readonly dataScope: DataScopeService,
    private readonly ctx: RequestContextService,
  ) {}

  async findMany(query: { storeId?: string; status?: PurchaseRequest['status'] } = {}) {
    const allowed = await this.dataScope.resolveAllowedStoreIds(this.ctx);
    const rows = await this.prisma.purchaseRequest.findMany({
      where: {
        tenantId: this.ctx.tenantId,
        storeId: query.storeId ?? (allowed === 'ALL' ? undefined : { in: allowed }),
        status: query.status,
      },
      include: { store: { select: { id: true, name: true } }, purchaseOrder: { select: { id: true, orderNo: true } }, _count: { select: { items: true } } },
      orderBy: [{ requestDate: 'desc' }, { createdAt: 'desc' }],
    });
    return Promise.all(rows.map((r) => this.reconcileStatus(r)));
  }

  async findOneOrThrow(id: string) {
    const row = await this.prisma.purchaseRequest.findFirst({ where: { id, tenantId: this.ctx.tenantId }, include });
    if (!row) throw new NotFoundException(`PurchaseRequest ${id} 不存在`);
    await this.dataScope.assertStoreAccessible(this.ctx, row.storeId);
    return this.reconcileStatus(row);
  }

  // ---------------- 明细（只有草稿能改） ----------------
  private async draftOrThrow(id: string, expectedVersion?: number) {
    const req = await this.findOneOrThrow(id);
    if (req.status !== 'DRAFT') throw new BadRequestException('只有草稿状态的申购单可以修改明细');
    if (expectedVersion !== undefined && req.version !== expectedVersion) throw new ConflictException('数据已被他人修改，请刷新后重试');
    return req;
  }

  private async resolveItem(name: string, spec: string | null) {
    const items = await this.prisma.inventoryItem.findMany({ where: { tenantId: this.ctx.tenantId, name }, select: { id: true, name: true, spec: true } });
    return items.find((i) => keyOf(i.name, i.spec) === keyOf(name, spec))?.id ?? null;
  }

  private normalize(body: RequestLineBody): Partial<Prisma.PurchaseRequestItemUncheckedUpdateInput> {
    const out: Record<string, unknown> = {};
    for (const k of ['name', 'spec', 'brand', 'unit', 'department', 'requester', 'purpose', 'remark'] as const) {
      if (body[k] !== undefined) out[k] = norm(body[k]) || null;
    }
    if (out.name === null) throw new BadRequestException('物品名称不能为空');
    if (body.quantity !== undefined) {
      if (!Number.isInteger(body.quantity) || body.quantity < 1) throw new BadRequestException('数量应为大于 0 的整数');
      out.quantity = body.quantity;
    }
    if (body.unitPrice !== undefined) {
      if (body.unitPrice !== null && body.unitPrice < 0) throw new BadRequestException('单价不能是负数');
      out.unitPrice = body.unitPrice === null || body.unitPrice === 0 ? null : body.unitPrice;
    }
    if (body.itemId !== undefined) out.itemId = body.itemId || null;
    return out as Partial<Prisma.PurchaseRequestItemUncheckedUpdateInput>;
  }

  private async recalc(tx: Prisma.TransactionClient, requestId: string) {
    const lines = await tx.purchaseRequestItem.findMany({ where: { purchaseRequestId: requestId } });
    const total = round2(lines.reduce((s, l) => s + Number(l.subtotal), 0));
    await tx.purchaseRequest.update({ where: { id: requestId }, data: { totalAmount: total, version: { increment: 1 } } });
  }

  async addLine(id: string, body: RequestLineBody, expectedVersion: number) {
    await this.draftOrThrow(id, expectedVersion);
    if (!body.name?.trim()) throw new BadRequestException('请填写物品名称');
    if (body.quantity === undefined) throw new BadRequestException('请填写数量');
    const data = this.normalize(body);
    const itemId = body.itemId !== undefined ? body.itemId : await this.resolveItem(norm(body.name), norm(body.spec) || null);
    const max = await this.prisma.purchaseRequestItem.aggregate({ where: { purchaseRequestId: id }, _max: { sortNo: true } });
    await this.prisma.$transaction(async (tx) => {
      const price = (data.unitPrice as number | null | undefined) ?? null;
      await tx.purchaseRequestItem.create({
        data: { ...(data as object), purchaseRequestId: id, sortNo: (max._max.sortNo ?? 0) + 1, itemId: itemId ?? null, subtotal: price === null ? 0 : round2((data.quantity as number) * price) } as Prisma.PurchaseRequestItemUncheckedCreateInput,
      });
      await this.recalc(tx, id);
    });
    return this.findOneOrThrow(id);
  }

  async updateLine(id: string, lineId: string, body: RequestLineBody, expectedVersion: number) {
    await this.draftOrThrow(id, expectedVersion);
    const line = await this.prisma.purchaseRequestItem.findFirst({ where: { id: lineId, purchaseRequestId: id } });
    if (!line) throw new NotFoundException('这一行不存在');
    const data = this.normalize(body);
    const qty = (data.quantity as number | undefined) ?? line.quantity;
    const price = data.unitPrice !== undefined ? (data.unitPrice as number | null) : line.unitPrice === null ? null : Number(line.unitPrice);
    // 改了名称/规格但没指定物品 → 重新按名称+规格去物品库对一次
    let itemId = data.itemId as string | null | undefined;
    if (itemId === undefined && (data.name !== undefined || data.spec !== undefined)) {
      itemId = await this.resolveItem(String(data.name ?? line.name), (data.spec !== undefined ? (data.spec as string | null) : line.spec) ?? null);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.purchaseRequestItem.update({
        where: { id: lineId },
        data: { ...(data as object), ...(itemId !== undefined ? { itemId } : {}), subtotal: price === null ? 0 : round2(qty * price) },
      });
      await this.recalc(tx, id);
    });
    return this.findOneOrThrow(id);
  }

  async removeLine(id: string, lineId: string, expectedVersion: number) {
    const req = await this.draftOrThrow(id, expectedVersion);
    if (req.items.length <= 1) throw new BadRequestException('至少要保留一行；整张不要了请用“取消申购单”');
    const line = req.items.find((l) => l.id === lineId);
    if (!line) throw new NotFoundException('这一行不存在');
    await this.prisma.$transaction(async (tx) => {
      await tx.purchaseRequestItem.delete({ where: { id: lineId } });
      await this.recalc(tx, id);
    });
    return this.findOneOrThrow(id);
  }

  // ---------------- 流程 ----------------
  async submit(id: string, expectedVersion: number) {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (before.status !== 'DRAFT') throw new BadRequestException(`申购单当前状态「${before.status}」不允许提交`);
    if (before.items.length === 0) throw new BadRequestException('申购单里没有物品');

    await this.workflowEngineService.startInstance(
      { definitionCode: DEFINITION_CODE, businessType: BUSINESS_TYPE, businessId: id, title: before.requestNo, storeId: before.storeId },
      this.actor(),
    );
    const updated = await runVersionedUpdate(() =>
      this.prisma.purchaseRequest.update({ where: { id, version: expectedVersion }, data: { status: 'PENDING_APPROVAL', version: { increment: 1 } }, include }),
    );
    await this.audit('STATE_TRANSITION', id, before, updated, 'DRAFT -> PENDING_APPROVAL', before.storeId);
    return updated;
  }

  async cancel(id: string, cancelReason: string, expectedVersion: number) {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (!['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'].includes(before.status)) throw new BadRequestException(`申购单当前状态「${before.status}」不允许取消`);
    const updated = await runVersionedUpdate(() =>
      this.prisma.purchaseRequest.update({ where: { id, version: expectedVersion }, data: { status: 'CANCELLED', cancelReason, version: { increment: 1 } }, include }),
    );
    await this.audit('STATE_TRANSITION', id, before, updated, `${before.status} -> CANCELLED：${cancelReason}`, before.storeId);
    return updated;
  }

  /**
   * 已批准的申购单 → 生成一张草稿采购单（选好供应商和仓库）。每一行都要对上物品资料、都要有单价；
   * 采购单单价按“分”存，申购单里的单价四舍五入到分，所以采购单合计可能和申购单差几分钱，返回里会写明。
   */
  async convert(
    id: string,
    input: { supplierId: string; warehouseId: string; fixes?: { lineId: string; unitPrice?: number; itemId?: string }[] },
    expectedVersion: number,
  ) {
    let before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (before.status !== 'APPROVED') throw new BadRequestException('只有已批准的申购单可以生成采购单');
    // 已批准后才知道报价/物品的行：这里允许补填“缺单价”“没对上物品”的行（已有的不改，避免改动批准过的内容）
    for (const fix of input.fixes ?? []) {
      const line = before.items.find((l) => l.id === fix.lineId);
      if (!line) throw new BadRequestException('补填的行不属于这张申购单');
      const data: Prisma.PurchaseRequestItemUncheckedUpdateInput = {};
      if (fix.unitPrice !== undefined && line.unitPrice === null) {
        if (!(fix.unitPrice > 0)) throw new BadRequestException(`${line.name} 的单价应大于 0`);
        data.unitPrice = fix.unitPrice;
        data.subtotal = round2(line.quantity * fix.unitPrice);
      }
      if (fix.itemId && !line.itemId) {
        if (!(await this.prisma.inventoryItem.findFirst({ where: { id: fix.itemId, tenantId: this.ctx.tenantId }, select: { id: true } }))) throw new BadRequestException(`${line.name} 选的物品不存在`);
        data.itemId = fix.itemId;
      }
      if (Object.keys(data).length > 0) await this.prisma.purchaseRequestItem.update({ where: { id: line.id }, data });
    }
    if ((input.fixes ?? []).length > 0) {
      const lines = await this.prisma.purchaseRequestItem.findMany({ where: { purchaseRequestId: id } });
      const total = round2(lines.reduce((sum, l) => sum + Number(l.subtotal), 0));
      await this.prisma.purchaseRequest.update({ where: { id }, data: { totalAmount: total } });
      before = await this.findOneOrThrow(id);
    }
    const problems = before.items
      .filter((l) => !l.itemId || l.unitPrice === null)
      .map((l, i) => `第 ${l.sortNo ?? i + 1} 行 ${l.name}：${!l.itemId ? '还没有对应的物品资料' : '没有单价'}`);
    if (problems.length > 0) {
      throw new BadRequestException(`有 ${problems.length} 行还不能生成采购单：${problems.slice(0, 5).join('；')}${problems.length > 5 ? '…' : ''}。请在生成采购单时补全`);
    }
    const order = await this.purchaseOrderService.create({
      storeId: before.storeId,
      warehouseId: input.warehouseId,
      supplierId: input.supplierId,
      remark: `由申购单 ${before.requestNo} 生成`,
      items: before.items.map((l) => ({ itemId: l.itemId!, quantity: l.quantity, unitPrice: Math.round(Number(l.unitPrice) * 100) })),
    });
    const updated = await runVersionedUpdate(() =>
      this.prisma.purchaseRequest.update({ where: { id, version: expectedVersion }, data: { status: 'ORDERED', purchaseOrderId: order.id, version: { increment: 1 } }, include }),
    );
    await this.audit('STATE_TRANSITION', id, before, updated, `APPROVED -> ORDERED（采购单 ${order.orderNo}）`, before.storeId);
    const orderTotalYuan = (order as unknown as { totalAmount: number }).totalAmount / 100;
    return { request: updated, purchaseOrder: order, amountDiff: round2(orderTotalYuan - Number(before.totalAmount)) };
  }

  /** 只要还停在 PENDING_APPROVAL，就查一下挂在它身上的 WorkflowInstance，按其终态推进。 */
  private async reconcileStatus<T extends { id: string; status: PurchaseRequest['status']; storeId: string }>(row: T): Promise<T> {
    if (row.status !== 'PENDING_APPROVAL') return row;
    const instance = await this.prisma.workflowInstance.findFirst({ where: { businessType: BUSINESS_TYPE, businessId: row.id }, orderBy: { createdAt: 'desc' } });
    if (!instance) return row;
    let next: 'APPROVED' | 'REJECTED' | 'DRAFT' | null = null;
    if (instance.status === 'APPROVED' || instance.status === 'ARCHIVED') next = 'APPROVED';
    else if (instance.status === 'REJECTED') next = 'REJECTED';
    else if (instance.status === 'WITHDRAWN') next = 'DRAFT';
    if (!next) return row;
    const updated = await this.prisma.purchaseRequest.update({ where: { id: row.id }, data: { status: next, version: { increment: 1 } } });
    await this.audit('STATE_TRANSITION', row.id, row, updated, `PENDING_APPROVAL -> ${next}（同步自 WorkflowInstance ${instance.id}）`, row.storeId);
    return { ...row, status: updated.status, version: updated.version } as T;
  }

  private assertVersion(before: { version: number }, expectedVersion: number) {
    if (before.version !== expectedVersion) throw new ConflictException('数据已被他人修改，请刷新后重试');
  }

  private async audit(action: 'STATE_TRANSITION', id: string, before: unknown, after: unknown, remark: string, storeId: string) {
    await this.auditLogService.record({
      action,
      entityType: 'PurchaseRequest',
      entityId: id,
      beforeData: before as Prisma.InputJsonValue,
      afterData: after as Prisma.InputJsonValue,
      remark,
      tenantId: this.ctx.tenantId,
      storeId,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    });
  }

  private actor(): ActorContext {
    return { accountId: this.ctx.accountId, tenantId: this.ctx.tenantId, storeId: this.ctx.homeStoreId, ip: this.ctx.ip, userAgent: this.ctx.userAgent, requestId: this.ctx.requestId };
  }
}
