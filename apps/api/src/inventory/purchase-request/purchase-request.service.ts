import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PurchaseRequest } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { ActorContext } from '../../common/context/actor-context';
import { DataScopeService } from '../../common/scope/data-scope.service';
import { runVersionedUpdate } from '../../common/utils/versioned-update.util';
import { WorkflowEngineService } from '../../workflow/workflow-engine/workflow-engine.service';
import { PurchaseOrderService } from '../purchase-order/purchase-order.service';
import { InventoryItemImportService, keyOf, norm } from '../inventory-item/inventory-item-import.service';
import { generateBusinessNo } from '../../common/utils/business-no.util';

const DEFINITION_CODE = 'INVENTORY_PURCHASE_REQUEST';
const BUSINESS_TYPE = 'PURCHASE_REQUEST';
const include = {
  summaryRequest: { select: { id: true, requestNo: true, status: true } },
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
 * 采购流程：
 *   ① 部门负责人填“部门申购单”（kind=DEPARTMENT）：DRAFT → 提交 → SUBMITTED（本身不审批），自动出现在客服的“待汇总”里；
 *   ② 客服选若干张 SUBMITTED 的部门申购单“汇总”，生成一张“汇总申购单”（kind=SUMMARY，DRAFT，可补单价/改数量），
 *      被汇总的部门申购单变 COLLECTED；
 *   ③ 汇总申购单 DRAFT -(提交)-> PENDING_APPROVAL -(通用工作流，店长审批)-> APPROVED/REJECTED；
 *   ④ APPROVED 后生成采购单（选供应商和仓库）→ ORDERED：采购单直接是“待采购”，不再审批，交给采购员（见 PurchaseOrderService）。
 * 老的 Excel 导入申购表也是汇总申购单。只有 DRAFT 能改明细。PENDING_APPROVAL 的后续推进与采购单一样，读取时懒同步自 WorkflowInstance。
 * 可见范围：没有“汇总/生成采购单”权限的人（如部门负责人）只能看到自己提交的部门申购单。
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
    private readonly itemImport: InventoryItemImportService,
  ) {}

  /** 采购岗（客服/采购员/店长…）能看到整个门店的申购单；其他人（部门负责人）只能看自己提交的部门申购单。 */
  private async isProcurementStaff() {
    return (await this.ctx.hasPermission('inventory.purchase-request.collect')) || (await this.ctx.hasPermission('inventory.purchase-request.convert'));
  }

  private async withCreatorNames<T extends { createdBy: string }>(rows: T[]): Promise<(T & { creatorName: string })[]> {
    const ids = [...new Set(rows.map((r) => r.createdBy))];
    const accs = ids.length ? await this.prisma.account.findMany({ where: { id: { in: ids } }, select: { id: true, realName: true } }) : [];
    const name = new Map(accs.map((a) => [a.id, a.realName]));
    return rows.map((r) => ({ ...r, creatorName: name.get(r.createdBy) ?? '' }));
  }

  async findMany(query: { storeId?: string; status?: PurchaseRequest['status']; kind?: PurchaseRequest['kind'] } = {}) {
    const allowed = await this.dataScope.resolveAllowedStoreIds(this.ctx);
    const staff = await this.isProcurementStaff();
    const rows = await this.prisma.purchaseRequest.findMany({
      where: {
        tenantId: this.ctx.tenantId,
        storeId: query.storeId ?? (allowed === 'ALL' ? undefined : { in: allowed }),
        status: query.status,
        kind: staff ? query.kind : 'DEPARTMENT',
        // 非采购岗：只能看自己提交的部门申购单
        ...(staff ? {} : { createdBy: this.ctx.accountId }),
        // 采购岗看别人的部门申购单时，不看对方还没提交的草稿
        ...(staff ? { NOT: { kind: 'DEPARTMENT', status: 'DRAFT', createdBy: { not: this.ctx.accountId } } } : {}),
      },
      include: {
        store: { select: { id: true, name: true } },
        purchaseOrder: { select: { id: true, orderNo: true } },
        summaryRequest: { select: { id: true, requestNo: true } },
        _count: { select: { items: true } },
        // 列表里按物品搜索用：只带名称/规格/品牌
        items: { select: { name: true, spec: true, brand: true } },
      },
      orderBy: [{ requestDate: 'desc' }, { createdAt: 'desc' }],
    });
    return this.withCreatorNames(await Promise.all(rows.map((r) => this.reconcileStatus(r))));
  }

  async findOneOrThrow(id: string) {
    const row = await this.prisma.purchaseRequest.findFirst({ where: { id, tenantId: this.ctx.tenantId }, include });
    if (!row) throw new NotFoundException(`PurchaseRequest ${id} 不存在`);
    await this.dataScope.assertStoreAccessible(this.ctx, row.storeId);
    if (!(await this.isProcurementStaff()) && (row.kind !== 'DEPARTMENT' || row.createdBy !== this.ctx.accountId)) {
      throw new ForbiddenException('只能查看自己提交的部门申购单');
    }
    return this.reconcileStatus(row);
  }

  // ---------------- 手动新建（汇总申购单） ----------------
  /**
   * 手动新建申购单（汇总申购单，草稿）：物品可以从物品库里选（带 itemId），也可以填之前没采购过的新物品；
   * createMissingItems=true 时，新物品（写了单位的）同时加入物品库。之后和导入的申购单一样：补单价 → 提交审批 → 生成采购单。
   */
  async createManual(body: { storeId: string; requestDate?: string; remark?: string; items: RequestLineBody[]; createMissingItems?: boolean }) {
    const store = await this.prisma.store.findFirst({ where: { id: body.storeId, tenantId: this.ctx.tenantId } });
    if (!store) throw new BadRequestException('请选择申购所属的门店');
    await this.dataScope.assertStoreAccessible(this.ctx, store.id);
    if (!body.items?.length) throw new BadRequestException('请至少添加一项要申购的物品');
    if (body.items.length > 500) throw new BadRequestException('一张申购单最多 500 行');
    const me = await this.prisma.account.findUnique({ where: { id: this.ctx.accountId! }, select: { realName: true } });

    const rows = body.items.map((raw, i) => {
      if (!raw.name?.trim()) throw new BadRequestException(`第 ${i + 1} 行请填写物品名称`);
      if (raw.quantity === undefined) throw new BadRequestException(`第 ${i + 1} 行（${raw.name}）请填写数量`);
      return { raw, data: this.normalize({ ...raw, requester: raw.requester ?? me?.realName }) };
    });
    // 新物品加入物品库（只处理没选已有物品、且写了单位的）
    const itemIdByKey = new Map<string, string>();
    if (body.createMissingItems) {
      const fresh = rows.filter((r) => !r.raw.itemId && norm(r.raw.unit));
      if (fresh.length > 0) {
        const made = await this.itemImport.ensureItems(
          fresh.map((r, n) => ({ rowNo: n + 1, name: norm(r.raw.name), spec: norm(r.raw.spec) || null, brand: norm(r.raw.brand) || null, unit: norm(r.raw.unit) || null, referencePrice: (r.data.unitPrice as number | null | undefined) ?? null })),
          { createMissing: true, purpose: 'LOGISTICS' },
        );
        made.forEach((v, k) => itemIdByKey.set(k, v));
      }
    }
    const lines: Prisma.PurchaseRequestItemUncheckedCreateWithoutPurchaseRequestInput[] = [];
    for (const [i, r] of rows.entries()) {
      const price = (r.data.unitPrice as number | null | undefined) ?? null;
      const key = keyOf(norm(r.raw.name), norm(r.raw.spec) || null);
      const itemId = r.raw.itemId ?? itemIdByKey.get(key) ?? (await this.resolveItem(norm(r.raw.name), norm(r.raw.spec) || null));
      lines.push({ ...(r.data as object), sortNo: i + 1, itemId: itemId ?? null, subtotal: price === null ? 0 : round2((r.data.quantity as number) * price) } as Prisma.PurchaseRequestItemUncheckedCreateWithoutPurchaseRequestInput);
    }
    const created = await this.prisma.purchaseRequest.create({
      data: {
        tenantId: this.ctx.tenantId!,
        storeId: store.id,
        requestNo: generateBusinessNo('SG'),
        requestDate: body.requestDate && /^\d{4}-\d{2}-\d{2}$/.test(body.requestDate) ? new Date(body.requestDate) : new Date(),
        kind: 'SUMMARY',
        status: 'DRAFT',
        totalAmount: round2(lines.reduce((s, l) => s + Number(l.subtotal ?? 0), 0)),
        remark: body.remark?.trim() || null,
        createdBy: this.ctx.accountId!,
        items: { create: lines },
      },
      include,
    });
    await this.audit('STATE_TRANSITION', created.id, null, created, `手动新建申购单（${lines.length} 项）`, store.id);
    return created;
  }

  // ---------------- 部门申购单 / 汇总 ----------------
  /** 部门负责人新建部门申购单：申请部门取自本人所在部门，申请人=本人；可直接“保存并提交”。 */
  async createDepartment(body: { storeId?: string; requestDate?: string; remark?: string; items: RequestLineBody[]; submit?: boolean }) {
    const me = await this.prisma.account.findUniqueOrThrow({ where: { id: this.ctx.accountId! }, include: { department: { select: { name: true } } } });
    // 门店：优先用账号所属门店；没设置时，如果管理范围只有一家门店就用它
    let storeId = body.storeId ?? me.storeId ?? this.ctx.homeStoreId ?? undefined;
    if (!storeId) {
      const allowed = await this.dataScope.resolveAllowedStoreIds(this.ctx);
      if (allowed !== 'ALL' && allowed.length === 1) storeId = allowed[0];
    }
    if (!storeId) throw new BadRequestException('您的账号还没有设置所属门店，请联系管理员在“账号管理 → 编辑”里补上门店，再填写申购单');
    await this.dataScope.assertStoreAccessible(this.ctx, storeId);
    if (!me.department?.name) throw new BadRequestException('您的账号还没有设置所属部门，申购单要写明申请部门。请联系管理员在“账号管理 → 编辑”里补上部门，再填写申购单');
    const departmentName = me.department.name;
    if (!body.items?.length) throw new BadRequestException('请至少填写一项要申购的物品');
    const lines: Prisma.PurchaseRequestItemUncheckedCreateWithoutPurchaseRequestInput[] = [];
    for (const [i, raw] of body.items.entries()) {
      if (!raw.name?.trim()) throw new BadRequestException(`第 ${i + 1} 行请填写物品名称`);
      if (raw.quantity === undefined) throw new BadRequestException(`第 ${i + 1} 行（${raw.name}）请填写数量`);
      const data = this.normalize({ ...raw, department: departmentName, requester: me.realName });
      const price = (data.unitPrice as number | null | undefined) ?? null;
      const itemId = raw.itemId ?? (await this.resolveItem(norm(raw.name), norm(raw.spec) || null));
      lines.push({ ...(data as object), sortNo: i + 1, itemId: itemId ?? null, subtotal: price === null ? 0 : round2((data.quantity as number) * price) } as Prisma.PurchaseRequestItemUncheckedCreateWithoutPurchaseRequestInput);
    }
    const created = await this.prisma.purchaseRequest.create({
      data: {
        tenantId: this.ctx.tenantId!,
        storeId,
        requestNo: generateBusinessNo('SG'),
        requestDate: body.requestDate ? new Date(body.requestDate) : new Date(),
        kind: 'DEPARTMENT',
        departmentName,
        status: body.submit ? 'SUBMITTED' : 'DRAFT',
        totalAmount: round2(lines.reduce((s, l) => s + Number(l.subtotal ?? 0), 0)),
        remark: body.remark?.trim() || null,
        createdBy: this.ctx.accountId!,
        items: { create: lines },
      },
      include,
    });
    await this.audit('STATE_TRANSITION', created.id, null, created, `创建部门申购单（${departmentName}）${body.submit ? '并提交，等客服汇总' : ''}`, storeId);
    return created;
  }

  /** 部门申购单提交后、被汇总前，发起人可以撤回成草稿重新修改。 */
  async recall(id: string, expectedVersion: number) {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (before.kind !== 'DEPARTMENT' || before.status !== 'SUBMITTED') throw new BadRequestException('只有已提交、还没被客服汇总的部门申购单可以撤回');
    if (before.createdBy !== this.ctx.accountId && !(await this.isProcurementStaff())) throw new ForbiddenException('只能撤回自己的申购单');
    const updated = await runVersionedUpdate(() => this.prisma.purchaseRequest.update({ where: { id, version: expectedVersion }, data: { status: 'DRAFT', version: { increment: 1 } }, include }));
    await this.audit('STATE_TRANSITION', id, before, updated, 'SUBMITTED -> DRAFT（撤回修改）', before.storeId);
    return updated;
  }

  /** 客服汇总：把选中的“已提交”部门申购单合并成一张汇总申购单草稿（保留每行的申请部门/申请人），原部门申购单变“已汇总”。 */
  async collect(ids: string[], remark?: string) {
    if (!ids?.length) throw new BadRequestException('请先勾选要汇总的部门申购单');
    const rows = await this.prisma.purchaseRequest.findMany({ where: { id: { in: ids }, tenantId: this.ctx.tenantId }, include: { items: { orderBy: { sortNo: 'asc' } } }, orderBy: { createdAt: 'asc' } });
    if (rows.length !== new Set(ids).size) throw new NotFoundException('有部门申购单不存在');
    const storeIds = new Set(rows.map((r) => r.storeId));
    if (storeIds.size > 1) throw new BadRequestException('一次只能汇总同一个门店的申购单');
    const bad = rows.find((r) => r.kind !== 'DEPARTMENT' || r.status !== 'SUBMITTED');
    if (bad) throw new BadRequestException(`申购单 ${bad.requestNo} 不是“已提交”的部门申购单（可能已被汇总或已撤回），请刷新后重新勾选`);
    const storeId = rows[0].storeId;
    await this.dataScope.assertStoreAccessible(this.ctx, storeId);

    const lines = rows.flatMap((r) => r.items);
    const summary = await this.prisma.$transaction(async (tx) => {
      const created = await tx.purchaseRequest.create({
        data: {
          tenantId: this.ctx.tenantId!,
          storeId,
          requestNo: generateBusinessNo('SG'),
          requestDate: new Date(),
          kind: 'SUMMARY',
          status: 'DRAFT',
          totalAmount: round2(lines.reduce((s, l) => s + Number(l.subtotal), 0)),
          remark: remark?.trim() || `汇总自：${rows.map((r) => `${r.departmentName ?? ''}${r.requestNo}`).join('、')}`,
          createdBy: this.ctx.accountId!,
          items: {
            create: lines.map((l, i) => ({
              sortNo: i + 1,
              itemId: l.itemId,
              name: l.name,
              spec: l.spec,
              brand: l.brand,
              unit: l.unit,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              subtotal: l.subtotal,
              department: l.department,
              requester: l.requester,
              purpose: l.purpose,
              remark: l.remark,
            })),
          },
        },
        include,
      });
      await tx.purchaseRequest.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { status: 'COLLECTED', summaryRequestId: created.id } });
      return created;
    });
    await this.audit('STATE_TRANSITION', summary.id, null, summary, `汇总 ${rows.length} 张部门申购单：${rows.map((r) => r.requestNo).join('、')}`, storeId);
    return summary;
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
    if (before.kind === 'DEPARTMENT') {
      // 部门申购单提交 = 交给客服汇总，本身不审批（审批发生在汇总申购单上）
      if (before.createdBy !== this.ctx.accountId && !(await this.isProcurementStaff())) throw new ForbiddenException('只能提交自己的申购单');
      const submitted = await runVersionedUpdate(() => this.prisma.purchaseRequest.update({ where: { id, version: expectedVersion }, data: { status: 'SUBMITTED', version: { increment: 1 } }, include }));
      await this.audit('STATE_TRANSITION', id, before, submitted, 'DRAFT -> SUBMITTED（提交给客服汇总）', before.storeId);
      return submitted;
    }

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
    if (!['DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'].includes(before.status)) throw new BadRequestException(`申购单当前状态「${before.status}」不允许取消`);
    if (before.kind === 'DEPARTMENT' && before.createdBy !== this.ctx.accountId && !(await this.isProcurementStaff())) throw new ForbiddenException('只能取消自己的申购单');
    const updated = await runVersionedUpdate(() =>
      this.prisma.$transaction(async (tx) => {
        // 汇总申购单作废：被它汇总的部门申购单放回“待汇总”，客服可以重新汇总
        await tx.purchaseRequest.updateMany({ where: { summaryRequestId: id, status: 'COLLECTED' }, data: { status: 'SUBMITTED', summaryRequestId: null } });
        return tx.purchaseRequest.update({ where: { id, version: expectedVersion }, data: { status: 'CANCELLED', cancelReason, version: { increment: 1 } }, include });
      }),
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
    if (before.kind !== 'SUMMARY') throw new BadRequestException('部门申购单要先由客服汇总，汇总申购单审批通过后才能生成采购单');
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
    }, { autoApprove: true }); // 申购单已经店长审批过，采购单不再审批，直接交给采购员
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
