import { BadRequestException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { randomToken, sha256 } from '../care-signature/signature.util';
import { ageInMonths, describeMetric, GrowthStandard, METRIC_LABEL, MONTH_DAYS, parseStandard, rate, standardRow, STANDARD_INFO } from './growth.util';
import { GrowthMetric, GrowthSex } from './ws423-data';

/** 展示最多到第 3 个月（月子中心的宝宝用得到的范围；两套标准都覆盖 0～3 月） */
const MAX_MONTHS = 3;

const DAY_MS = 86_400_000;
const SHARE_TTL_DAYS = 90;
const METRICS: GrowthMetric[] = ['weight', 'length', 'head'];
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const today = () => new Date(`${new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)}T00:00:00.000Z`);
const RANGE: Record<GrowthMetric, [number, number]> = { weight: [500, 20000], length: [25, 120], head: [20, 60] };

export interface GrowthPoint {
  date: string;
  ageDays: number;
  /** 月龄（早产儿为矫正月龄）；算不出来（出生日期缺失等）时为 null */
  ageMonths: number | null;
  value: number;
  source: 'GROWTH' | 'DAILY' | 'BIRTH' | 'ADMISSION';
  recordId?: string;
  rating: string | null;
  pctText: string | null;
  /** 这个月龄上的 P3 P10 P25 P50 P75 P90 P97 */
  row: number[] | null;
}

/** 宝宝生长曲线：和国家卫健委 WS/T 423-2022、WHO 两套标准的百分位对比（可选）。内部页面和发给客户的链接共用这一份数据。 */
@Injectable()
export class CareGrowthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  private async baby(id: string) {
    const b = await this.prisma.babyProfile.findFirst({ where: { id, tenantId: this.ctx.tenantId }, include: { motherProfile: { select: { id: true, storeId: true, gestationalWeeks: true } } } });
    if (!b) throw new NotFoundException('宝宝档案不存在');
    return b;
  }

  /** 报告数据（不依赖登录上下文，内部页面和客户链接共用）。 */
  async buildReport(babyId: string, tenantId: string, standardRaw?: string) {
    const standard: GrowthStandard = parseStandard(standardRaw);
    const b = await this.prisma.babyProfile.findFirst({ where: { id: babyId, tenantId }, include: { motherProfile: { select: { gestationalWeeks: true } } } });
    if (!b) throw new NotFoundException('宝宝档案不存在');
    const sex: GrowthSex | null = b.gender === 'MALE' || b.gender === 'FEMALE' ? b.gender : null;
    // 新生儿入所评估表（出生日期/出生体重/入所日期+入所体重身长头围）：宝宝档案里没填的出生信息从这里补
    const adm = await this.prisma.careBabyAdmission.findFirst({
      where: { tenantId, babyProfileId: babyId },
      select: { birthDate: true, birthWeightG: true, admissionDate: true, admissionWeightG: true, admissionLengthCm: true, headCircumferenceCm: true },
    });
    const birthRaw = b.birthDate ?? adm?.birthDate ?? null;
    const birthWeightG = b.birthWeightGrams ?? adm?.birthWeightG ?? null;
    const birth = birthRaw ? new Date(`${ymd(new Date(birthRaw.getTime() + 8 * 3600_000))}T00:00:00.000Z`) : null;
    const hints: string[] = [];
    if (adm && (adm.admissionWeightG != null || adm.admissionLengthCm != null || adm.headCircumferenceCm != null) && !adm.admissionDate) {
      hints.push('新生儿入所评估里填了入所体重/身长/头围，但没有填“入所日期”，这些数据没法画到曲线上（请到入所评估里补上入所日期）');
    }
    const ga = b.motherProfile.gestationalWeeks;
    const notReady: string[] = [];
    if (!sex) notReady.push('宝宝性别');
    if (!birth) notReady.push('出生日期');

    const growth = await this.prisma.babyGrowthRecord.findMany({ where: { tenantId, babyProfileId: babyId }, orderBy: { measuredAt: 'asc' } });
    const daily = await this.prisma.careDailyBabyRecord.findMany({
      where: { tenantId, babyProfileId: babyId, OR: [{ weightG: { not: null } }, { lengthCm: { not: null } }, { headCm: { not: null } }] },
      select: { weightG: true, lengthCm: true, headCm: true, dailyRecord: { select: { recordDate: true } } },
    });

    // 每个指标、每个日期只保留一个值：手工测量 > 日常护理记录里的体重/身长/头围 > 出生体重
    const raw: Record<GrowthMetric, Map<string, { value: number; source: GrowthPoint['source']; recordId?: string }>> = { weight: new Map(), length: new Map(), head: new Map() };
    if (birthWeightG && birth) raw.weight.set(ymd(birth), { value: Math.round(birthWeightG) / 1000, source: 'BIRTH' });
    // 入所评估：入所体重/身长/头围按“入所日期”那天画点（比出生优先，日常记录和手工测量再覆盖它）
    if (adm?.admissionDate) {
      const k = ymd(adm.admissionDate);
      if (adm.admissionWeightG != null) raw.weight.set(k, { value: adm.admissionWeightG / 1000, source: 'ADMISSION' });
      if (adm.admissionLengthCm != null) raw.length.set(k, { value: adm.admissionLengthCm, source: 'ADMISSION' });
      if (adm.headCircumferenceCm != null) raw.head.set(k, { value: adm.headCircumferenceCm, source: 'ADMISSION' });
    }
    for (const d of daily) {
      const k = ymd(d.dailyRecord.recordDate);
      if (d.weightG != null) raw.weight.set(k, { value: d.weightG / 1000, source: 'DAILY' });
      if (d.lengthCm != null) raw.length.set(k, { value: d.lengthCm, source: 'DAILY' });
      if (d.headCm != null) raw.head.set(k, { value: d.headCm, source: 'DAILY' });
    }
    for (const g of growth) {
      const k = ymd(g.measuredAt);
      if (g.weightG != null) raw.weight.set(k, { value: g.weightG / 1000, source: 'GROWTH', recordId: g.id });
      if (g.lengthCm != null) raw.length.set(k, { value: g.lengthCm, source: 'GROWTH', recordId: g.id });
      if (g.headCm != null) raw.head.set(k, { value: g.headCm, source: 'GROWTH', recordId: g.id });
    }

    const points = { weight: [] as GrowthPoint[], length: [] as GrowthPoint[], head: [] as GrowthPoint[] };
    for (const m of METRICS) {
      for (const [date, v] of [...raw[m].entries()].sort((x, y) => x[0].localeCompare(y[0]))) {
        const at = new Date(`${date}T00:00:00.000Z`);
        const age = birth ? ageInMonths(birth, at, ga) : { months: null, days: 0, corrected: false };
        const row = sex && age.months !== null ? standardRow(m, sex, age.months, standard) : null;
        // 体重内部按 kg 对标准（标准表是 kg），对外统一用克
        const toOut = (x: number) => (m === 'weight' ? Math.round(x * 1000) : x);
        const outRow = row ? row.map(toOut) : null;
        const outVal = toOut(v.value);
        const d = outRow ? describeMetric(m, outVal, outRow) : null;
        points[m].push({ date, ageDays: age.days, ageMonths: age.months === null ? null : Math.round(age.months * 100) / 100, value: outVal, source: v.source, recordId: v.recordId, rating: d?.rating ?? null, pctText: d?.pctText ?? null, row: outRow });
      }
    }

    // 标准曲线（0～3 个月）：国家标准只给整月龄，每月一个点；WHO 有按日表，每 7 天一个点（再补满 3 个月整点）
    const curves: Record<GrowthMetric, { ages: number[]; rows: number[][] } | null> = { weight: null, length: null, head: null };
    if (sex) {
      const ageList = standard === 'WHO' ? [...Array.from({ length: 13 }, (_, i) => (i * 7) / MONTH_DAYS), MAX_MONTHS] : Array.from({ length: MAX_MONTHS + 1 }, (_, i) => i);
      for (const m of METRICS) {
        const ages: number[] = [];
        const rows: number[][] = [];
        for (const a of ageList) {
          const r = standardRow(m, sex, a, standard);
          if (r) {
            ages.push(Math.round(a * 1000) / 1000);
            rows.push(m === 'weight' ? r.map((x) => Math.round(x * 1000)) : r);
          }
        }
        curves[m] = { ages, rows };
      }
    }

    const latest = METRICS.map((m) => {
      const p = points[m].filter((x) => x.row).at(-1);
      if (!p || !p.row) return null;
      const d = describeMetric(m, p.value, p.row);
      return { metric: m, name: METRIC_LABEL[m].name, unit: METRIC_LABEL[m].unit, date: p.date, value: p.value, ageMonths: p.ageMonths, rating: d.rating, pctText: d.pctText, text: d.text, p3: p.row[0], p50: p.row[3], p97: p.row[6] };
    }).filter((x): x is NonNullable<typeof x> => x !== null);

    return {
      baby: { id: b.id, name: b.name, sequenceNo: b.sequenceNo, sex, birthDate: birth ? ymd(birth) : null, preterm: !!ga && ga < 37, gestationalWeeks: ga ?? null },
      ready: notReady.length === 0,
      notReady,
      hints,
      points,
      curves,
      latest,
      records: growth
        .slice()
        .reverse()
        .map((g) => ({ id: g.id, date: ymd(g.measuredAt), weightG: g.weightG, lengthCm: g.lengthCm, headCm: g.headCm, measuredByName: g.measuredByName, note: g.note })),
      standard,
      standardLabel: STANDARD_INFO[standard].label,
      source: STANDARD_INFO[standard].source,
      maxMonths: MAX_MONTHS,
      generatedAt: new Date().toISOString(),
    };
  }

  async report(babyId: string, standard?: string) {
    await this.baby(babyId);
    return this.buildReport(babyId, this.ctx.tenantId!, standard);
  }

  async addRecord(dto: { babyProfileId: string; measuredAt: string; weightG?: number | null; lengthCm?: number | null; headCm?: number | null; note?: string | null }) {
    const b = await this.baby(dto.babyProfileId);
    const day = String(dto.measuredAt ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(new Date(day).getTime())) throw new BadRequestException('测量日期格式不正确');
    if (day > ymd(today())) throw new BadRequestException('不能记录未来的日期');
    if (b.birthDate && day < ymd(new Date(b.birthDate.getTime() + 8 * 3600_000))) throw new BadRequestException('测量日期不能早于宝宝出生日期');
    const vals = { weight: dto.weightG == null ? null : Math.round(dto.weightG),  length: dto.lengthCm ?? null, head: dto.headCm ?? null };
    if (vals.weight === null && vals.length === null && vals.head === null) throw new BadRequestException('体重、身长、头围至少填一项');
    for (const m of METRICS) {
      const v = vals[m];
      if (v !== null && (v < RANGE[m][0] || v > RANGE[m][1])) throw new BadRequestException(`${METRIC_LABEL[m].name}应在 ${RANGE[m][0]}~${RANGE[m][1]} ${METRIC_LABEL[m].unit} 之间，请核对`);
    }
    const me = await this.prisma.account.findUnique({ where: { id: this.ctx.accountId! }, select: { realName: true } });
    const created = await this.prisma.babyGrowthRecord.create({
      data: {
        tenantId: this.ctx.tenantId!,
        storeId: b.storeId,
        motherProfileId: b.motherProfileId,
        babyProfileId: b.id,
        measuredAt: new Date(`${day}T00:00:00.000Z`),
        weightG: vals.weight,
        lengthCm: vals.length,
        headCm: vals.head,
        measuredByName: me?.realName ?? null,
        note: dto.note?.trim() || null,
        createdBy: this.ctx.accountId!,
      },
    });
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'BabyGrowthRecord',
      entityId: created.id,
      afterData: { day, ...vals },
      remark: `记录宝宝生长测量 ${day}`,
      tenantId: this.ctx.tenantId,
      storeId: b.storeId,
      accountId: this.ctx.accountId,
      requestId: this.ctx.requestId,
    });
    return created;
  }

  async removeRecord(id: string) {
    const r = await this.prisma.babyGrowthRecord.findFirst({ where: { id, tenantId: this.ctx.tenantId } });
    if (!r) throw new NotFoundException('记录不存在');
    await this.prisma.babyGrowthRecord.delete({ where: { id } });
    await this.auditLogService.record({
      action: 'DELETE',
      entityType: 'BabyGrowthRecord',
      entityId: id,
      beforeData: { day: ymd(r.measuredAt), weightG: r.weightG, lengthCm: r.lengthCm, headCm: r.headCm },
      tenantId: this.ctx.tenantId,
      storeId: r.storeId,
      accountId: this.ctx.accountId,
      requestId: this.ctx.requestId,
    });
  }

  // ---------------- 发给客户的链接 ----------------
  async createShare(babyId: string) {
    const b = await this.baby(babyId);
    await this.prisma.babyGrowthShare.updateMany({ where: { babyProfileId: b.id, revokedAt: null }, data: { revokedAt: new Date() } }); // 新链接生效，旧的作废
    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + SHARE_TTL_DAYS * DAY_MS);
    const link = await this.prisma.babyGrowthShare.create({ data: { tenantId: this.ctx.tenantId!, babyProfileId: b.id, tokenHash: sha256(token), expiresAt, createdBy: this.ctx.accountId! } });
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'BabyGrowthShare',
      entityId: link.id,
      remark: `生成宝宝生长曲线客户链接（${SHARE_TTL_DAYS} 天有效）`,
      tenantId: this.ctx.tenantId,
      storeId: b.storeId,
      accountId: this.ctx.accountId,
      requestId: this.ctx.requestId,
    });
    return { id: link.id, token, path: `/g/${token}`, expiresAt };
  }

  async revokeShares(babyId: string) {
    const b = await this.baby(babyId);
    const r = await this.prisma.babyGrowthShare.updateMany({ where: { babyProfileId: b.id, revokedAt: null }, data: { revokedAt: new Date() } });
    return { revoked: r.count };
  }

  /** 客户打开链接：不需要登录；链接作废/过期给明确提示。 */
  async publicReport(token: string, standard?: string) {
    const link = await this.prisma.babyGrowthShare.findUnique({ where: { tokenHash: sha256(token ?? '') } });
    if (!link) throw new NotFoundException('链接无效，请联系月子中心重新发送');
    if (link.revokedAt) throw new GoneException('这个链接已经失效，请联系月子中心获取最新链接');
    if (link.expiresAt.getTime() < Date.now()) throw new GoneException('链接已过期，请联系月子中心重新发送');
    await this.prisma.babyGrowthShare.update({ where: { id: link.id }, data: { openCount: { increment: 1 }, lastOpenedAt: new Date() } });
    return this.buildReport(link.babyProfileId, link.tenantId, standard);
  }
}

void rate;
