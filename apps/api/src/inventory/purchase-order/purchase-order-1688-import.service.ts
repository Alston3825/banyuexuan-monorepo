import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { CellValue, readXlsx } from '../../common/utils/xlsx-reader';
import { PurchaseOrderLogisticsService } from './purchase-order-logistics.service';

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
  expressNo?: string | null;
  expressCompany?: string | null;
  extraExpressNos?: string[];
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
    private readonly logistics: PurchaseOrderLogisticsService,
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

    type Pair = { o: number; p: number; score: number; reasons: string[] };
    const pairs: Pair[] = [];
    const linkedPo = new Map<number, number>();
    orders.forEach((o, oi) => {
      const sellerNames = [o.seller, o.sellerMember].filter(Boolean);
      const allTitles = o.titles.join(' ');
      const amounts = [o.goodsTotal, o.paid, o.goodsTotal + o.freight].map(fen);
      pos.forEach((p, pi) => {
        if (p.platformOrderNo === o.orderNo) {
          pairs.push({ o: oi, p: pi, score: 200, reasons: ['已经登记过这张 1688 订单号'] });
          linkedPo.set(oi, pi);
          return;
        }
        if (p.platformOrderNo) return; // 已对上别的 1688 订单
        let score = 0;
        const reasons: string[] = [];
        if (amounts.includes(p.totalAmount) && p.totalAmount > 0) {
          score += 50;
          reasons.push(`金额一致（${(p.totalAmount / 100).toFixed(2)} 元）`);
        } else {
          const near = amounts.some((a) => a > 0 && Math.abs(a - p.totalAmount) / a <= 0.1);
          if (near) {
            score += 15;
            reasons.push('金额接近');
          }
        }
        const sup = p.supplier.name;
        const supSim = Math.max(0, ...sellerNames.map((s) => (s.includes(sup) || sup.includes(s) ? 1 : dice(s, sup))));
        if (supSim >= 0.5) {
          score += Math.round(25 * supSim);
          reasons.push('供应商名称相近');
        }
        const names = p.items.map((i) => `${i.item.name}${i.item.spec ?? ''}`);
        if (names.length) {
          const sim = names.reduce((s, n) => s + containment(n, allTitles), 0) / names.length;
          if (sim >= 0.4) {
            score += Math.round(30 * sim);
            reasons.push('货品名称相符');
          }
        }
        if (o.createdAt) {
          const gap = Math.abs(new Date(o.createdAt).getTime() - p.createdAt.getTime());
          if (gap <= 3 * 86400_000) score += 5;
        }
        if (score >= 30) pairs.push({ o: oi, p: pi, score, reasons });
      });
    });

    // 一对一：分数高的先配
    const takenO = new Set<number>();
    const takenP = new Set<number>();
    const chosen = new Map<number, Pair>();
    for (const pr of [...pairs].sort((a, b) => b.score - a.score)) {
      if (takenO.has(pr.o) || takenP.has(pr.p)) continue;
      takenO.add(pr.o);
      takenP.add(pr.p);
      chosen.set(pr.o, pr);
    }

    const rows: Import1688Row[] = orders.map((o, oi) => {
      const mine = pairs.filter((x) => x.o === oi).sort((a, b) => b.score - a.score);
      const pick = chosen.get(oi) ?? null;
      const second = mine.find((x) => x !== pick);
      const margin = pick ? pick.score - (second?.score ?? 0) : 0;
      const confidence: Import1688Row['confidence'] = !pick ? 'none' : pick.score >= 200 || (pick.score >= 75 && margin >= 15) ? 'high' : pick.score >= 45 ? 'medium' : 'none';
      const notes: string[] = [];
      if (/关闭|取消/.test(o.status)) notes.push(`订单状态“${o.status}”，一般不用登记`);
      if (!o.expressNos.length) notes.push('还没发货/没有运单号，只登记订单号');
      else if (!o.expressCompany) notes.push(`快递公司“${o.expressCompanyRaw || '空'}”没认出来，只登记订单号，请到采购单里手动选快递公司`);
      if (o.expressNos.length > 1) notes.push(`有 ${o.expressNos.length} 个运单号，系统先查第 1 个，其余记在备注里`);
      return {
        order: o,
        confidence,
        score: pick?.score ?? 0,
        reasons: pick?.reasons ?? [],
        match: confidence === 'none' ? null : brief(pos[pick!.p]),
        alternatives: mine.slice(0, 4).map((x) => brief(pos[x.p])),
        alreadyLinked: linkedPo.get(oi) !== undefined && pick?.p === linkedPo.get(oi),
        notes,
      };
    });
    rows.sort((a, b) => ({ high: 0, medium: 1, none: 2 })[a.confidence] - ({ high: 0, medium: 1, none: 2 })[b.confidence]);
    return { rows, total: rows.length };
  }

  async commit(items: Import1688CommitItem[]) {
    if (!items?.length) throw new BadRequestException('没有要登记的订单');
    const results: { purchaseOrderId: string; platformOrderNo: string; ok: boolean; error?: string }[] = [];
    const seen = new Set<string>();
    for (const it of items) {
      const base = { purchaseOrderId: it.purchaseOrderId, platformOrderNo: it.platformOrderNo };
      try {
        if (seen.has(it.purchaseOrderId)) throw new BadRequestException('同一张采购单被选了多次');
        seen.add(it.purchaseOrderId);
        const dup = await this.prisma.purchaseOrder.findFirst({
          where: { tenantId: this.ctx.tenantId, platformOrderNo: it.platformOrderNo, id: { not: it.purchaseOrderId } },
          select: { orderNo: true },
        });
        if (dup) throw new BadRequestException(`这张 1688 订单已经登记在采购单 ${dup.orderNo} 上`);
        await this.logistics.updateInfo(it.purchaseOrderId, {
          platform: '1688',
          platformOrderNo: it.platformOrderNo,
          expressNo: it.expressNo || undefined,
          expressCompany: it.expressNo && it.expressCompany ? it.expressCompany : undefined,
        });
        if (it.extraExpressNos?.length) {
          const po = await this.prisma.purchaseOrder.findFirst({ where: { id: it.purchaseOrderId, tenantId: this.ctx.tenantId }, select: { purchaseNote: true } });
          const line = `1688 另有运单号：${it.extraExpressNos.join('、')}`;
          if (!po?.purchaseNote?.includes(line)) {
            await this.prisma.purchaseOrder.update({ where: { id: it.purchaseOrderId }, data: { purchaseNote: [po?.purchaseNote, line].filter(Boolean).join('\n') } });
          }
        }
        results.push({ ...base, ok: true });
      } catch (e) {
        results.push({ ...base, ok: false, error: e instanceof Error ? e.message : '登记失败' });
      }
    }
    return { results, okCount: results.filter((r) => r.ok).length };
  }
}
