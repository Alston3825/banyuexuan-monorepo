import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma, WarehousePurpose } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { DataScopeService } from '../../common/scope/data-scope.service';
import { generateBusinessNo } from '../../common/utils/business-no.util';
import { CellValue, readXlsx } from '../../common/utils/xlsx-reader';
import { keyOf, norm, InventoryItemImportService } from '../inventory-item/inventory-item-import.service';

/** 申购表里一行（预览时给前端核对/修改，确认时再传回来） */
export interface RequestImportRow {
  rowNo: number;
  department: string | null;
  requester: string | null;
  name: string;
  spec: string | null;
  brand: string | null;
  unit: string | null;
  quantity: number | null;
  unitPrice: number | null;
  purpose: string | null;
}

export interface RequestImportPreviewRow extends RequestImportRow {
  /** 表里写的小计，仅用来和系统核算的金额对照 */
  sheetSubtotal: number | null;
  /** 对上了哪个物品资料；null = 物品库里还没有 */
  itemId: string | null;
  issues: string[];
}

export interface RequestImportPreview {
  sheetName: string;
  headerRow: number;
  titleText: string | null;
  storeGuess: { id: string; name: string } | null;
  requestDate: string | null;
  sheetTotal: number | null;
  rows: RequestImportPreviewRow[];
  duplicate: { id: string; requestNo: string; totalAmount: string } | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const beijingToday = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

const COLS: Record<'department' | 'requester' | 'name' | 'spec' | 'brand' | 'quantity' | 'unit' | 'price' | 'subtotal' | 'purpose', (h: string) => boolean> = {
  department: (h) => h.includes('部门'),
  requester: (h) => h.includes('申请人') || h.includes('申购人'),
  name: (h) => ['物品名称', '名称', '品名', '物品', '商品名称', '物料名称'].includes(h),
  spec: (h) => h.includes('规格') || h.includes('型号') || h.includes('尺寸'),
  brand: (h) => h.includes('品牌'),
  quantity: (h) => h === '数量' || h === '申购数量',
  unit: (h) => h === '单位' || h === '计量单位',
  price: (h) => h.includes('单价'),
  subtotal: (h) => h.includes('小计') || h === '金额',
  purpose: (h) => h.includes('用途'),
};

const text = (v: CellValue): string | null => {
  if (v === null || v === undefined) return null;
  const t = norm(String(v));
  return t || null;
};
const num = (v: CellValue): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.replace(/[,\s元]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

@Injectable()
export class PurchaseRequestImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly itemImport: InventoryItemImportService,
    private readonly auditLogService: AuditLogService,
    private readonly dataScope: DataScopeService,
    private readonly ctx: RequestContextService,
  ) {}

  private async itemKeyMap() {
    const items = await this.prisma.inventoryItem.findMany({ where: { tenantId: this.ctx.tenantId }, select: { id: true, name: true, spec: true } });
    return new Map(items.map((i) => [keyOf(i.name, i.spec), i.id]));
  }

  private rowIssues(r: RequestImportRow): string[] {
    const issues: string[] = [];
    if (r.quantity === null) issues.push('缺数量');
    else if (!Number.isInteger(r.quantity) || r.quantity < 1) issues.push('数量应为大于 0 的整数');
    if (r.unitPrice !== null && r.unitPrice < 0) issues.push('单价不能是负数');
    return issues;
  }

  private async findDuplicate(storeId: string | null, requestDate: string | null) {
    if (!storeId || !requestDate) return null;
    const dup = await this.prisma.purchaseRequest.findFirst({
      where: { tenantId: this.ctx.tenantId, storeId, requestDate: new Date(`${requestDate}T00:00:00.000Z`), status: { not: 'CANCELLED' } },
      select: { id: true, requestNo: true, totalAmount: true },
    });
    return dup ? { id: dup.id, requestNo: dup.requestNo, totalAmount: dup.totalAmount.toString() } : null;
  }

  /** 读申购表：找到表头行，识别 申请部门/申请人/物品名称/规格/品牌/数量/单位/单价/小计/用途；从标题行读门店和日期。 */
  async preview(file: Buffer): Promise<RequestImportPreview> {
    let sheets;
    try {
      sheets = readXlsx(file);
    } catch (e) {
      throw new BadRequestException(`读取不了这个文件：${(e as Error).message}。请上传 Excel（.xlsx）文件`);
    }
    for (const sheet of sheets) {
      const headerIdx = sheet.rows.slice(0, 20).findIndex((r) => r.some((c) => COLS.name(text(c) ?? '')));
      if (headerIdx < 0) continue;
      const header = sheet.rows[headerIdx].map((c) => text(c) ?? '');
      const idxOf = (k: keyof typeof COLS) => header.findIndex((h) => h && COLS[k](h));
      const idx = Object.fromEntries((Object.keys(COLS) as (keyof typeof COLS)[]).map((k) => [k, idxOf(k)])) as Record<keyof typeof COLS, number>;

      // 标题行（表头上面）：“申购部门：高新店  2026.8.25”
      const titleText = sheet.rows.slice(0, headerIdx).flat().map(text).filter(Boolean).join(' ') || null;
      const stores = await this.prisma.store.findMany({ where: { tenantId: this.ctx.tenantId }, select: { id: true, name: true } });
      const token = titleText ? /申购部门[：:]\s*([^\s\d]+)/.exec(titleText)?.[1] : undefined;
      const storeGuess = token ? (stores.find((s) => s.name.includes(token)) ?? null) : null;
      const dm = titleText ? /(\d{4})\s*[.\-/年]\s*(\d{1,2})\s*[.\-/月]\s*(\d{1,2})/.exec(titleText) : null;
      const requestDate = dm ? `${dm[1]}-${dm[2].padStart(2, '0')}-${dm[3].padStart(2, '0')}` : null;

      const itemByKey = await this.itemKeyMap();
      const rows: RequestImportPreviewRow[] = [];
      let sheetTotal: number | null = null;
      for (let r = headerIdx + 1; r < sheet.rows.length; r++) {
        const row = sheet.rows[r] ?? [];
        const get = (k: keyof typeof COLS) => (idx[k] >= 0 ? row[idx[k]] : null);
        const name = text(get('name'));
        if (!name) {
          // “合计”行：记下表里的合计，用来对账
          if (row.some((c) => text(c) === '合计') && idx.subtotal >= 0) sheetTotal = num(row[idx.subtotal]);
          continue;
        }
        const base: RequestImportRow = {
          rowNo: r + 1,
          department: text(get('department')),
          requester: text(get('requester')),
          name,
          spec: text(get('spec')),
          brand: text(get('brand')),
          unit: text(get('unit')),
          quantity: num(get('quantity')),
          unitPrice: ((p) => (p !== null && p > 0 ? p : null))(num(get('price'))), // 0/空 = 待询价
          purpose: text(get('purpose')),
        };
        rows.push({ ...base, sheetSubtotal: num(get('subtotal')), itemId: itemByKey.get(keyOf(name, base.spec)) ?? null, issues: this.rowIssues(base) });
      }
      return { sheetName: sheet.name, headerRow: headerIdx + 1, titleText, storeGuess, requestDate, sheetTotal, rows, duplicate: await this.findDuplicate(storeGuess?.id ?? null, requestDate) };
    }
    throw new BadRequestException('没有在表里找到“物品名称”这一列，请确认表头里有“物品名称”');
  }

  /** 选好门店/日期后重新检查是否重复导入 */
  async checkDuplicate(storeId: string, requestDate: string) {
    return this.findDuplicate(storeId, requestDate);
  }

  async commit(input: {
    storeId: string;
    requestDate?: string;
    sourceFileName?: string;
    remark?: string;
    rows: RequestImportRow[];
    createMissingItems: boolean;
    allowDuplicate: boolean;
  }) {
    const store = await this.prisma.store.findFirst({ where: { id: input.storeId, tenantId: this.ctx.tenantId } });
    if (!store) throw new BadRequestException('请选择申购所属的门店');
    await this.dataScope.assertStoreAccessible(this.ctx, store.id);
    const requestDate = input.requestDate && /^\d{4}-\d{2}-\d{2}$/.test(input.requestDate) ? input.requestDate : beijingToday();
    if (!Array.isArray(input.rows) || input.rows.length === 0) throw new BadRequestException('没有要导入的物品');
    if (input.rows.length > 1000) throw new BadRequestException('一张申购单最多 1000 行');

    const rows = input.rows.map((r) => ({
      ...r,
      name: norm(r.name),
      spec: norm(r.spec) || null,
      brand: norm(r.brand) || null,
      unit: norm(r.unit) || null,
      department: norm(r.department) || null,
      requester: norm(r.requester) || null,
      purpose: norm(r.purpose) || null,
      unitPrice: r.unitPrice === null || r.unitPrice === undefined || r.unitPrice === 0 ? null : Number(r.unitPrice),
      quantity: r.quantity === null || r.quantity === undefined ? null : Number(r.quantity),
    }));
    const bad = rows.filter((r) => !r.name || this.rowIssues(r).length > 0);
    if (bad.length > 0) {
      throw new BadRequestException(`有 ${bad.length} 行不能导入：${bad.slice(0, 5).map((r) => `第 ${r.rowNo} 行${r.name ? ' ' + r.name : ''}（${r.name ? this.rowIssues(r).join('、') : '缺物品名称'}）`).join('；')}${bad.length > 5 ? '…' : ''}。请修改或取消勾选这些行`);
    }
    const dup = await this.findDuplicate(store.id, requestDate);
    if (dup && !input.allowDuplicate) {
      throw new ConflictException(`这个门店 ${requestDate} 已经有一张申购单 ${dup.requestNo}（金额 ${dup.totalAmount} 元），确认要再导入一张吗？`);
    }

    // 对上物品资料；物品库里没有的按需新建（要有单位才能建）
    const unique = [...new Map(rows.map((r) => [keyOf(r.name, r.spec), r])).values()];
    const itemIds = await this.itemImport.ensureItems(
      unique.map((r) => ({ rowNo: r.rowNo, name: r.name, spec: r.spec, brand: r.brand, unit: r.unit, referencePrice: r.unitPrice })),
      { createMissing: input.createMissingItems, purpose: 'LOGISTICS' as WarehousePurpose },
    );

    const lines = rows.map((r, i) => ({
      sortNo: i + 1,
      itemId: itemIds.get(keyOf(r.name, r.spec)) ?? null,
      name: r.name,
      spec: r.spec,
      brand: r.brand,
      unit: r.unit,
      quantity: r.quantity!,
      unitPrice: r.unitPrice,
      subtotal: r.unitPrice === null ? 0 : round2(r.quantity! * r.unitPrice),
      department: r.department,
      requester: r.requester,
      purpose: r.purpose,
    }));
    const totalAmount = round2(lines.reduce((s, l) => s + l.subtotal, 0));

    const created = await this.prisma.$transaction(async (tx) => {
      const request = await tx.purchaseRequest.create({
        data: {
          tenantId: this.ctx.tenantId!,
          storeId: store.id,
          requestNo: generateBusinessNo('SG'),
          requestDate: new Date(`${requestDate}T00:00:00.000Z`),
          totalAmount,
          sourceFileName: input.sourceFileName?.slice(0, 190) || null,
          remark: input.remark?.trim() || null,
          createdBy: this.ctx.accountId!,
        },
      });
      await tx.purchaseRequestItem.createMany({ data: lines.map((l) => ({ ...l, purchaseRequestId: request.id })) });
      return request;
    });
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'PurchaseRequest',
      entityId: created.id,
      afterData: { requestNo: created.requestNo, lines: lines.length, totalAmount, source: input.sourceFileName ?? null } as Prisma.InputJsonValue,
      remark: `Excel 导入申购单 ${created.requestNo}（${lines.length} 行，${totalAmount} 元）`,
      tenantId: this.ctx.tenantId,
      storeId: store.id,
      accountId: this.ctx.accountId,
      requestId: this.ctx.requestId,
    });
    return {
      id: created.id,
      requestNo: created.requestNo,
      lines: lines.length,
      totalAmount,
      linkedItems: lines.filter((l) => l.itemId).length,
      unlinked: lines.filter((l) => !l.itemId).map((l) => l.name),
    };
  }
}
