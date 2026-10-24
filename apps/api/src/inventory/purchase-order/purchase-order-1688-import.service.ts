import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { CellValue, readXlsx } from '../../common/utils/xlsx-reader';
import { PurchaseOrderLogisticsCore } from './purchase-order-logistics.core';

/** 1688 导出的订单（同一订单号的多行货品已合并） */
export interface Import1688Order {
  orderNo: string;
  seller: string;
  sellerMember: string;
  status: string;
  createdAt: string | null;
  goodsTotal: number;
  freight: number;
  paid: number;
  titles: string[];
  expressCompanyRaw: string;
  expressCompany: string | null;
  expressNos: string[];
}

export interface Import1688PoBrief {
  id: string;
  orderNo: string;
  supplierName: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  itemsText: string;
  expressNo: string | null;
  platformOrderNo: string | null;
}

export interface Import1688Row {
  order: Import1688Order;
  /** high=可放心；medium=请核对；none=没对上 */
  confidence: 'high' | 'medium' | 'none';
  score: number;
  reasons: string[];
  match: Import1688PoBrief | null;
  alternatives: Import1688PoBrief[];
  /** 已经对上过这张 1688 订单 */
  alreadyLinked: boolean;
  notes: string[];
}

export interface Import1688CommitItem {
  purchaseOrderId: string;
  platformOrderNo: string;
  sellerName?: string | null;
  goodsTitle?: string | null;
  /** 实付，元 */
  paid?: number;
  orderStatus?: string | null;
  expressCompany?: string | null;
  expressNos?: string[];
}

/** 1688 里的快递公司名 → 快递100 编码 */
const COMPANY_KEYWORDS: [string, string][] = [
  ['中通快运', 'zhongtongkuaiyun'],
  ['中通', 'zhongtong'],
  ['圆通', 'yuantong'],
  ['申通', 'shentong'],
  ['韵达', 'yunda'],
  ['极兔', 'jtexpress'],
  ['顺丰', 'shunfeng'],
  ['邮政', 'youzhengguonei'],
  ['EMS', 'ems'],
  ['京东', 'jd'],
  ['德邦', 'debangwuliu'],
  ['百世', 'huitongkuaidi'],
  ['优速', 'youshuwuliu'],
  ['安能', 'annengwuliu'],
  ['跨越', 'kuayue'],
  ['宅急送', 'zhaijisong'],
];
export const companyCodeOf = (raw: string): string | null => COMPANY_KEYWORDS.find(([k]) => raw.toUpperCase().includes(k))?.[1] ?? null;

const HEADERS = {
  orderNo: '订单编号',
  seller: '卖家公司名',
  sellerMember: '卖家会员名',
  goodsTotal: '货品总价(元)',
  freight: '运费(元)',
  paid: '实付款(元)',
  status: '订单状态',
  createdAt: '订单创建时间',
  title: '货品标题',
  company: '物流公司',
  expressNo: '运单号',
};

const text = (v: CellValue | undefined) => (v === null || v === undefined ? '' : String(v).trim());
const num = (v: CellValue | undefined) => {
  const n = Number(text(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const fen = (yuan: number) => Math.round(yuan * 100);
const excelDate = (v: CellValue | undefined): string | null => {
  const s = text(v);
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return new Date((Number(s) - 25569) * 86400_000 - 8 * 3600_000).toISOString();
  const d = new Date(s.replace(/-/g, '/') + ' +0800');
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const grams = (s: string) => {
  const t = s.replace(/[\s（）()【】\[\]、,，.。/\\*×xX\d-]+/g, '');
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
};
/** a 里的二字词有多少出现在 b 里（0~1） */
const containment = (a: string, b: string) => {
  const ga = grams(a);
  if (!ga.size) return 0;
  const gb = grams(b);
  let hit = 0;
  for (const g of ga) if (gb.has(g)) hit++;
  return hit / ga.size;
};
const dice = (a: string, b: string) => {
  const ga = grams(a);
  const gb = grams(b);
  if (!ga.size || !gb.size) return 0;
  let hit = 0;
  for (const g of ga) if (gb.has(g)) hit++;
  return (2 * hit) / (ga.size + gb.size);
};

/**
 * 导入 1688 导出的订单表（“已买到的货品 → 导出订单”）：按 金额 / 供应商 / 货品名 / 时间 智能对应到系统采购单，
 * 对上后登记平台订单号、快递公司和运单号（之后由快递100 自动查物流）。分两步：preview 只算不写，commit 用户确认后才写。
 */
@Injectable()
export class PurchaseOrder1688ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContextService,
    private readonly core: PurchaseOrderLogisticsCore,
  ) {}

  parse(buf: Buffer): Import1688Order[] {
    let sheets;
    try {
      sheets = readXlsx(buf);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : '文件读取失败');
    }
    const sheet = sheets[0];
    if (!sheet || sheet.rows.length < 2) throw new BadRequestException('表格里没有数据');
    const head = sheet.rows[0].map((c) => text(c));
    const col = (name: string) => head.indexOf(name);
    const idx = Object.fromEntries(Object.entries(HEADERS).map(([k, h]) => [k, col(h)])) as Record<keyof typeof HEADERS, number>;
    if (idx.orderNo < 0 || idx.title < 0) throw new BadRequestException('这不像 1688 导出的订单表（找不到“订单编号”“货品标题”列）');
    const get = (r: CellValue[], k: keyof typeof HEADERS) => (idx[k] >= 0 ? r[idx[k]] : null);

    const orders: Import1688Order[] = [];
    let cur: Import1688Order | null = null;
    for (const r of sheet.rows.slice(1)) {
      if (!r || r.every((c) => c === null || text(c) === '')) continue;
      const no = text(get(r, 'orderNo'));
      if (no) {
        cur = {
          orderNo: no,
          seller: text(get(r, 'seller')),
          sellerMember: text(get(r, 'sellerMember')),
          status: text(get(r, 'status')),
          createdAt: excelDate(get(r, 'createdAt')),
          goodsTotal: num(get(r, 'goodsTotal')),
          freight: num(get(r, 'freight')),
          paid: num(get(r, 'paid')),
          titles: [],
          expressCompanyRaw: '',
          expressCompany: null,
          expressNos: [],
        };
        orders.push(cur);
      }
      if (!cur) continue;
      const title = text(get(r, 'title'));
      if (title) cur.titles.push(title);
      const comp = text(get(r, 'company'));
      if (comp && !cur.expressCompanyRaw) cur.expressCompanyRaw = comp;
      for (const n of text(get(r, 'expressNo')).split(/[,，;；\s]+/)) if (n && !cur.expressNos.includes(n)) cur.expressNos.push(n);
    }
    for (const o of orders) o.expressCompany = companyCodeOf(o.expressCompanyRaw);
    return orders;
  }

  async preview(buf: Buffer): Promise<{ rows: Import1688Row[]; total: number }> {
    const orders = this.parse(buf);
    if (!orders.length) throw new BadRequestException('表格里没有订单');
    const since = new Date(Date.now() - 90 * 86400_000);
    const pos = await this.prisma.purchaseOrder.findMany({
      where: { tenantId: this.ctx.tenantId, status: { notIn: ['DRAFT', 'CANCELLED', 'REJECTED'] }, createdAt: { gte: since } },
      include: { supplier: { select: { name: true } }, items: { include: { item: { select: { name: true, spec: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    const brief = (p: (typeof pos)[number]): Import1688PoBrief => ({
      id: p.id,
      orderNo: p.orderNo,
      supplierName: p.supplier.name,
      status: p.status,
      totalAmount: p.totalAmount,
      createdAt: p.createdAt.toISOString(),
      itemsText: p.items.map((i) => `${i.item.name}${i.item.spec ? `(${i.item.spec})` : ''}×${i.quantity}`).join('、'),
      expressNo: p.expressNo,
      platformOrderNo: p.platformOrderNo,
    });
    // 之前登记过的 1688 订单号 → 采购单
    const linked = await this.prisma.purchaseOrderShipment.findMany({
      where: { tenantId: this.ctx.tenantId, platformOrderNo: { in: orders.map((o) => o.orderNo) } },
      select: { platformOrderNo: true, purchaseOrderId: true },
    });
    const linkedMap = new Map(linked.map((l) => [l.platformOrderNo, l.purchaseOrderId]));

    // 一张采购单常常对应 1688 上的很多笔订单，所以不做“一对一”，每笔订单各自找最像的采购单
    const rows: Import1688Row[] = orders.map((o) => {
      const sellerNames = [o.seller, o.sellerMember].filter(Boolean);
      const allTitles = o.titles.join(' ');
      const amounts = [o.goodsTotal, o.paid, o.goodsTotal + o.freight].map(fen);
      const scored = pos.map((p) => {
        let score = 0;
        const reasons: string[] = [];
        if (linkedMap.get(o.orderNo) === p.id || p.platformOrderNo === o.orderNo) return { p, score: 200, reasons: ['已经登记过这张 1688 订单号'] };
        if (p.totalAmount > 0 && amounts.includes(p.totalAmount)) {
          score += 50;
          reasons.push(`金额一致（${(p.totalAmount / 100).toFixed(2)} 元）`);
        }
        const sup = p.supplier.name;
        const supSim = Math.max(0, ...sellerNames.map((x) => (x.includes(sup) || sup.includes(x) ? 1 : dice(x, sup))));
        if (supSim >= 0.5) {
          score += Math.round(25 * supSim);
          reasons.push('供应商名称相近');
        }
        // 货品：采购单里有没有哪个物品名出现在这笔订单的货品标题里（采购单可以有很多物品，命中其中几个即可）
        const hits = p.items.filter((i) => containment(`${i.item.name}`, allTitles) >= 0.99).map((i) => i.item.name);
        if (hits.length) {
          score += Math.min(60, 45 + hits.length * 5);
          reasons.push(`货品相符：${hits.slice(0, 3).join('、')}`);
        } else {
          const best = Math.max(0, ...p.items.map((i) => containment(`${i.item.name}`, allTitles)));
          if (best >= 0.5) {
            score += Math.round(30 * best);
            reasons.push('货品名称部分相符');
          }
        }
        return { p, score, reasons };
      });
      const ranked = scored.filter((x) => x.score >= 30).sort((a, b) => b.score - a.score);
      const pick = ranked[0] ?? null;
      const margin = pick ? pick.score - (ranked[1]?.score ?? 0) : 0;
      const confidence: Import1688Row['confidence'] = !pick ? 'none' : pick.score >= 200 || (pick.score >= 50 && margin >= 15) ? 'high' : pick.score >= 40 ? 'medium' : 'none';
      const notes: string[] = [];
      if (/关闭|取消/.test(o.status)) notes.push(`订单状态“${o.status}”，一般不用登记`);
      if (!o.expressNos.length) notes.push('还没发货/没有运单号，只登记订单号，发货后再导入一次即可补上运单号');
      else if (!o.expressCompany) notes.push(`快递公司“${o.expressCompanyRaw || '空'}”没认出来，只登记订单号，不查物流`);
      if (o.expressNos.length > 1) notes.push(`有 ${o.expressNos.length} 个运单号，每个单号分别查物流`);
      return {
        order: o,
        confidence,
        score: pick?.score ?? 0,
        reasons: pick?.reasons ?? [],
        match: pick && confidence !== 'none' ? brief(pick.p) : null,
        alternatives: ranked.slice(0, 4).map((x) => brief(x.p)),
        alreadyLinked: !!pick && pick.score >= 200,
        notes,
      };
    });
    rows.sort((a, b) => ({ high: 0, medium: 1, none: 2 })[a.confidence] - ({ high: 0, medium: 1, none: 2 })[b.confidence]);
    return { rows, total: rows.length };
  }

  /** 确认登记：每笔 1688 订单（每个运单号）记成采购单下的一条“平台订单”，再用快递100 查物流（后台依次查） */
  async commit(items: Import1688CommitItem[]) {
    if (!items?.length) throw new BadRequestException('没有要登记的订单');
    const tenantId = this.ctx.tenantId!;
    const results: { purchaseOrderId: string; platformOrderNo: string; ok: boolean; error?: string }[] = [];
    const toRefresh: string[] = [];
    for (const it of items) {
      const base = { purchaseOrderId: it.purchaseOrderId, platformOrderNo: it.platformOrderNo };
      try {
        const po = await this.prisma.purchaseOrder.findFirst({ where: { id: it.purchaseOrderId, tenantId }, select: { id: true, status: true, orderNo: true } });
        if (!po) throw new BadRequestException('采购单不存在');
        if (po.status === 'DRAFT' || po.status === 'CANCELLED') throw new BadRequestException('这张采购单当前状态不需要登记物流');
        const other = await this.prisma.purchaseOrderShipment.findFirst({ where: { tenantId, platformOrderNo: it.platformOrderNo, purchaseOrderId: { not: po.id } }, include: { purchaseOrder: { select: { orderNo: true } } } });
        if (other) throw new BadRequestException(`这张 1688 订单已经登记在采购单 ${other.purchaseOrder.orderNo} 上`);
        const nos = (it.expressNos ?? []).map((n) => n.trim()).filter(Boolean);
        const company = it.expressCompany || null;
        const common = {
          sellerName: it.sellerName?.slice(0, 120) || null,
          goodsTitle: it.goodsTitle?.slice(0, 500) || null,
          amount: fen(it.paid ?? 0),
          orderStatus: it.orderStatus?.slice(0, 40) || null,
        };
        for (const no of nos.length ? nos : ['']) {
          const key = { purchaseOrderId: po.id, platformOrderNo: it.platformOrderNo, expressNo: no };
          const sh = await this.prisma.purchaseOrderShipment.upsert({
            where: { purchaseOrderId_platformOrderNo_expressNo: key },
            create: { tenantId, platform: '1688', ...key, ...common, expressCompany: no ? company : null, createdBy: this.ctx.accountId! },
            update: { ...common, expressCompany: no ? company : null },
          });
          if (no && company && (sh.logisticsState === null || sh.logisticsState === -1 || sh.logisticsError)) toRefresh.push(sh.id);
        }
        // 有了真实运单号，就把之前“还没发货”的占位记录去掉
        if (nos.length) await this.prisma.purchaseOrderShipment.deleteMany({ where: { purchaseOrderId: po.id, platformOrderNo: it.platformOrderNo, expressNo: '' } });
        results.push({ ...base, ok: true });
      } catch (e) {
        results.push({ ...base, ok: false, error: e instanceof Error ? e.message : '登记失败' });
      }
    }
    if (toRefresh.length) void this.core.refreshShipments(toRefresh);
    return { results, okCount: results.filter((r) => r.ok).length, querying: toRefresh.length };
  }
}
