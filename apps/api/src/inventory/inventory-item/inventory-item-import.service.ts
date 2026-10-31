import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, WarehousePurpose } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { CellValue, readXlsx } from '../../common/utils/xlsx-reader';

/** 导入表里每一行整理出来的一个物品 */
export interface ImportItemRow {
  rowNo: number;
  name: string;
  spec: string | null;
  brand: string | null;
  unit: string | null;
  referencePrice: number | null;
}

export type ImportRowStatus = 'NEW' | 'EXISTS' | 'DUP_IN_FILE' | 'MISSING_UNIT';

export interface ImportPreviewRow extends ImportItemRow {
  status: ImportRowStatus;
  message: string;
  existingId: string | null;
}

export interface ImportPreview {
  sheetName: string;
  headerRow: number;
  /** 表里有、但物品资料用不上的列（如数量、申请人、小计、用途） */
  ignoredColumns: string[];
  rows: ImportPreviewRow[];
}

const HEADER_ALIASES: Record<'name' | 'spec' | 'brand' | 'unit' | 'price', (h: string) => boolean> = {
  name: (h) => ['物品名称', '名称', '品名', '物品', '商品名称', '物料名称'].includes(h),
  spec: (h) => h.includes('规格') || h.includes('型号') || h.includes('尺寸'),
  brand: (h) => h.includes('品牌'),
  unit: (h) => h === '单位' || h === '计量单位',
  price: (h) => ['单价', '参考单价', '价格', '采购单价'].includes(h),
};

export const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
export const keyOf = (name: string, spec: string | null) => `${norm(name).toLowerCase()}|${norm(spec).toLowerCase()}`;
const cellText = (v: CellValue): string | null => {
  if (v === null || v === undefined) return null;
  const t = norm(String(v));
  return t || null;
};

@Injectable()
export class InventoryItemImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  /** 读 Excel：自动找到表头行（含“物品名称”那一行），按列名识别，不要求列顺序固定。 */
  async preview(file: Buffer): Promise<ImportPreview> {
    let sheets;
    try {
      sheets = readXlsx(file);
    } catch (e) {
      throw new BadRequestException(`读取不了这个文件：${(e as Error).message}。请上传 Excel（.xlsx）文件`);
    }
    for (const sheet of sheets) {
      const headerIdx = sheet.rows.slice(0, 20).findIndex((r) => r.some((c) => HEADER_ALIASES.name(cellText(c) ?? '')));
      if (headerIdx < 0) continue;
      const header = sheet.rows[headerIdx].map((c) => cellText(c) ?? '');
      const col = (k: keyof typeof HEADER_ALIASES) => header.findIndex((h) => h && HEADER_ALIASES[k](h));
      const idx = { name: col('name'), spec: col('spec'), brand: col('brand'), unit: col('unit'), price: col('price') };
      const used = new Set(Object.values(idx).filter((i) => i >= 0));
      const ignoredColumns = header.filter((h, i) => h && !used.has(i));

      const parsed: ImportItemRow[] = [];
      for (let r = headerIdx + 1; r < sheet.rows.length; r++) {
        const row = sheet.rows[r] ?? [];
        const name = cellText(row[idx.name]);
        if (!name) continue; // 空行、“合计”行都没有物品名称
        const priceRaw = idx.price >= 0 ? row[idx.price] : null;
        const price = typeof priceRaw === 'number' ? priceRaw : priceRaw ? Number(String(priceRaw).replace(/[^\d.]/g, '')) : NaN;
        parsed.push({
          rowNo: r + 1,
          name,
          spec: idx.spec >= 0 ? cellText(row[idx.spec]) : null,
          brand: idx.brand >= 0 ? cellText(row[idx.brand]) : null,
          unit: idx.unit >= 0 ? cellText(row[idx.unit]) : null,
          referencePrice: Number.isFinite(price) && price > 0 ? price : null, // 0/空 = 没填价格
        });
      }
      return { sheetName: sheet.name, headerRow: headerIdx + 1, ignoredColumns, rows: await this.classify(parsed) };
    }
    throw new BadRequestException('没有在表里找到“物品名称”这一列，请确认表头里有“物品名称”');
  }

  /** 给每一行标状态：新物品 / 系统里已有 / 文件里重复 / 缺单位 */
  async classify(rows: ImportItemRow[]): Promise<ImportPreviewRow[]> {
    const existing = await this.prisma.inventoryItem.findMany({ where: { tenantId: this.ctx.tenantId }, select: { id: true, name: true, spec: true } });
    const existingByKey = new Map(existing.map((e) => [keyOf(e.name, e.spec), e.id]));
    const seen = new Set<string>();
    return rows.map((r) => {
      const key = keyOf(r.name, r.spec);
      const existingId = existingByKey.get(key) ?? null;
      let status: ImportRowStatus = 'NEW';
      let message = '新物品，将新增';
      if (seen.has(key)) {
        status = 'DUP_IN_FILE';
        message = '表里已有同名同规格的物品，这一行不再重复导入';
      } else if (existingId) {
        status = 'EXISTS';
        message = '系统里已有同名同规格的物品';
      } else if (!r.unit) {
        status = 'MISSING_UNIT';
        message = '缺少单位，请补上单位后再导入';
      }
      seen.add(key);
      return { ...r, status, message, existingId };
    });
  }

  /** 下一批物品编码：WP0001、WP0002…（表里没有编码，系统自动编）；大小写、前后空格不同的老编码也算已占用，保证不撞号 */
  private async nextCodes(count: number): Promise<string[]> {
    return nextFreeCodes(await this.prisma.inventoryItem.findMany({ where: { tenantId: this.ctx.tenantId }, select: { code: true } }), count);
  }

  /**
   * 给一批“名称+规格”找到对应的物品资料；系统里没有的、且带了单位的，按需新建（编码自动编）。
   * 返回 名称+规格 → 物品 id（没有单位又没建成的不在结果里）。申购单导入用。
   */
  async ensureItems(rows: ImportItemRow[], opts: { createMissing: boolean; purpose: WarehousePurpose; category?: string }): Promise<Map<string, string>> {
    const classified = await this.classify(rows.map((r) => ({ ...r, name: norm(r.name), spec: norm(r.spec) || null, brand: norm(r.brand) || null, unit: norm(r.unit) || null })));
    const result = new Map<string, string>();
    const toCreate: ImportPreviewRow[] = [];
    for (const r of classified) {
      const key = keyOf(r.name, r.spec);
      if (r.existingId) result.set(key, r.existingId);
      else if (r.status === 'NEW' && opts.createMissing) toCreate.push(r);
    }
    if (toCreate.length === 0) return result;
    const codes = await this.nextCodes(toCreate.length);
    await this.prisma.$transaction(async (tx) => {
      for (const [i, r] of toCreate.entries()) {
        const created = await tx.inventoryItem.create({
          data: {
            tenantId: this.ctx.tenantId!,
            code: codes[i],
            name: r.name,
            unit: r.unit!,
            spec: r.spec,
            brand: r.brand,
            referencePrice: r.referencePrice,
            category: norm(opts.category) || null,
            purpose: opts.purpose,
            createdBy: this.ctx.accountId!,
          },
        });
        result.set(keyOf(r.name, r.spec), created.id);
      }
    });
    return result;
  }

  /**
   * 确认导入：重新按最新库存校验一遍再入库（预览之后别人可能已经加过）。
   * updateExisting=true 时，系统里已有的同名同规格物品只补充品牌/参考单价（单位、编码不动，避免影响库存）。
   */
  async commit(input: { items: ImportItemRow[]; purpose: WarehousePurpose; category?: string; updateExisting: boolean }) {
    if (input.items.length === 0) throw new BadRequestException('没有要导入的物品');
    if (input.items.length > 2000) throw new BadRequestException('一次最多导入 2000 个物品');
    const classified = await this.classify(input.items.map((i) => ({ ...i, name: norm(i.name), spec: norm(i.spec) || null, brand: norm(i.brand) || null, unit: norm(i.unit) || null })));
    const toCreate = classified.filter((r) => r.status === 'NEW');
    const toUpdate = input.updateExisting ? classified.filter((r) => r.status === 'EXISTS' && (r.brand || r.referencePrice !== null)) : [];
    const codes = await this.nextCodes(toCreate.length);
    const category = norm(input.category) || null;

    await this.prisma.$transaction(async (tx) => {
      for (const [i, r] of toCreate.entries()) {
        await tx.inventoryItem.create({
          data: {
            tenantId: this.ctx.tenantId!,
            code: codes[i],
            name: r.name,
            unit: r.unit!,
            spec: r.spec,
            brand: r.brand,
            referencePrice: r.referencePrice,
            category,
            purpose: input.purpose,
            createdBy: this.ctx.accountId!,
          },
        });
      }
      for (const r of toUpdate) {
        await tx.inventoryItem.update({
          where: { id: r.existingId! },
          data: {
            ...(r.brand ? { brand: r.brand } : {}),
            ...(r.referencePrice !== null ? { referencePrice: r.referencePrice } : {}),
            version: { increment: 1 },
          },
        });
      }
    });

    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'InventoryItem',
      entityId: 'IMPORT',
      afterData: { created: toCreate.length, updated: toUpdate.length, names: toCreate.map((r) => r.name) } as Prisma.InputJsonValue,
      remark: `Excel 导入物品：新增 ${toCreate.length}，更新 ${toUpdate.length}`,
      tenantId: this.ctx.tenantId,
      accountId: this.ctx.accountId,
      requestId: this.ctx.requestId,
    });
    return {
      created: toCreate.length,
      updated: toUpdate.length,
      skipped: classified.length - toCreate.length - toUpdate.length,
      skippedDetail: classified.filter((r) => !toCreate.includes(r) && !toUpdate.includes(r)).map((r) => ({ rowNo: r.rowNo, name: r.name, reason: r.message })),
    };
  }
}

/** 在已有编码之外，顺着 WP 序号往后取 count 个没被占用的编码（忽略大小写和首尾空格） */
export function nextFreeCodes(rows: { code: string }[], count: number): string[] {
  const used = new Set(rows.map((r) => r.code.trim().toUpperCase()));
  let max = 0;
  for (const c of used) {
    const m = /^WP(\d+)$/.exec(c);
    if (m) max = Math.max(max, Number(m[1]));
  }
  const out: string[] = [];
  while (out.length < count) {
    max += 1;
    const code = `WP${String(max).padStart(4, '0')}`;
    if (!used.has(code)) out.push(code);
  }
  return out;
}
