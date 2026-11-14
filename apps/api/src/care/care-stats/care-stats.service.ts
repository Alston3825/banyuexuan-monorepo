import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestContextService } from '../../common/context/request-context.service';

type Op = 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
const OPS: Op[] = ['gt', 'gte', 'lt', 'lte', 'eq'];
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export interface Metric {
  code: string;
  label: string;
  subject: 'BABY' | 'MOTHER';
  unit: string;
  /** 常用筛选预设（只是方便点选，不是报警规则——异常报警阈值以后由用户给出再做） */
  presets: { label: string; op: Op; value: number }[];
}

export const METRICS: Metric[] = [
  { code: 'BABY_JAUNDICE', label: '宝宝黄疸值（前额/眼角/前胸取最高）', subject: 'BABY', unit: '', presets: [{ label: '≥ 12', op: 'gte', value: 12 }, { label: '≥ 15', op: 'gte', value: 15 }] },
  { code: 'BABY_WEIGHT', label: '宝宝体重', subject: 'BABY', unit: 'g', presets: [{ label: '< 3000', op: 'lt', value: 3000 }] },
  { code: 'BABY_TEMP', label: '宝宝体温（早晚取最高）', subject: 'BABY', unit: '℃', presets: [{ label: '≥ 37.5', op: 'gte', value: 37.5 }, { label: '< 36', op: 'lt', value: 36 }] },
  { code: 'BABY_FORMULA_DAY', label: '宝宝当天奶粉总量', subject: 'BABY', unit: 'ml', presets: [{ label: '< 300', op: 'lt', value: 300 }] },
  { code: 'BABY_URINE_DAY', label: '宝宝当天小便次数', subject: 'BABY', unit: '次', presets: [{ label: '< 6', op: 'lt', value: 6 }] },
  { code: 'BABY_STOOL_DAY', label: '宝宝当天大便次数', subject: 'BABY', unit: '次', presets: [{ label: '= 0', op: 'eq', value: 0 }] },
  { code: 'MOTHER_TEMP', label: '妈妈体温', subject: 'MOTHER', unit: '℃', presets: [{ label: '≥ 37.5', op: 'gte', value: 37.5 }] },
  { code: 'MOTHER_BP_SYS', label: '妈妈收缩压（高压）', subject: 'MOTHER', unit: 'mmHg', presets: [{ label: '≥ 140', op: 'gte', value: 140 }] },
  { code: 'MOTHER_BP_DIA', label: '妈妈舒张压（低压）', subject: 'MOTHER', unit: 'mmHg', presets: [{ label: '≥ 90', op: 'gte', value: 90 }] },
  { code: 'MOTHER_PULSE', label: '妈妈脉搏', subject: 'MOTHER', unit: '次/分', presets: [{ label: '≥ 100', op: 'gte', value: 100 }] },
];

const pass = (v: number, op: Op, t: number) => (op === 'gt' ? v > t : op === 'gte' ? v >= t : op === 'lt' ? v < t : op === 'lte' ? v <= t : v === t);
const max = (...xs: (number | null | undefined)[]) => {
  const n = xs.filter((x): x is number => typeof x === 'number');
  return n.length ? Math.max(...n) : null;
};
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

/**
 * 护理数据的统计筛选与出所护理小结。数据来自日常护理记录里按列存的数值，可以按指标 + 条件 + 日期范围
 * 精确筛出符合的记录（例如“本月宝宝黄疸值 ≥ 12 的记录”）；预设按钮只是方便点选，不是报警规则。
 */
@Injectable()
export class CareStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContextService,
  ) {}

  metrics() {
    return METRICS;
  }

  async query(q: { metric: string; op: string; value: string | number; from?: string; to?: string; storeId?: string }) {
    const metric = METRICS.find((m) => m.code === q.metric);
    if (!metric) throw new BadRequestException('未知的统计指标');
    if (!OPS.includes(q.op as Op)) throw new BadRequestException('条件不正确');
    const threshold = Number(q.value);
    if (!Number.isFinite(threshold)) throw new BadRequestException('请输入数值');
    const dateFilter: Record<string, Date> = {};
    if (q.from) dateFilter.gte = new Date(`${q.from}T00:00:00.000Z`);
    if (q.to) dateFilter.lte = new Date(`${q.to}T00:00:00.000Z`);

    const records = await this.prisma.careDailyRecord.findMany({
      where: { tenantId: this.ctx.tenantId, storeId: q.storeId, ...(Object.keys(dateFilter).length ? { recordDate: dateFilter } : {}) },
      include: {
        motherProfile: { select: { customer: { select: { name: true } }, occupancy: { select: { room: { select: { roomNo: true } } } } } },
        babies: { include: { babyProfile: { select: { sequenceNo: true, name: true } }, feedings: true } },
      },
      orderBy: { recordDate: 'desc' },
      take: 5000,
    });

    const rows: { date: string; motherProfileId: string; roomNo: string | null; customerName: string; babyName: string | null; value: number }[] = [];
    for (const r of records) {
      const base = { date: ymd(r.recordDate), motherProfileId: r.motherProfileId, roomNo: r.motherProfile.occupancy?.room?.roomNo ?? null, customerName: r.motherProfile.customer.name };
      if (metric.subject === 'MOTHER') {
        const v = metric.code === 'MOTHER_TEMP' ? r.motherTemperature : metric.code === 'MOTHER_BP_SYS' ? r.motherBpSystolic : metric.code === 'MOTHER_BP_DIA' ? r.motherBpDiastolic : r.motherPulse;
        if (typeof v === 'number' && pass(v, q.op as Op, threshold)) rows.push({ ...base, babyName: null, value: v });
      } else {
        for (const b of r.babies) {
          const sum = (k: 'formulaMl') => b.feedings.reduce((a, f) => a + (f[k] ?? 0), 0);
          const v =
            metric.code === 'BABY_JAUNDICE' ? max(b.jaundiceForehead, b.jaundiceCanthus, b.jaundiceChest)
            : metric.code === 'BABY_WEIGHT' ? b.weightG
            : metric.code === 'BABY_TEMP' ? max(b.tempMorning, b.tempEvening)
            : b.feedings.length === 0 && metric.code.endsWith('_DAY') ? null
            : metric.code === 'BABY_FORMULA_DAY' ? sum('formulaMl')
            : metric.code === 'BABY_URINE_DAY' ? b.feedings.filter((f) => f.urine === 'YES').length
            : b.feedings.filter((f) => f.stool === 'YES').length;
          if (typeof v === 'number' && pass(v, q.op as Op, threshold)) rows.push({ ...base, babyName: b.babyProfile.name || `宝宝${b.babyProfile.sequenceNo}`, value: v });
        }
      }
    }
    return { metric: metric.code, label: metric.label, unit: metric.unit, total: rows.length, truncated: records.length >= 5000, rows: rows.slice(0, 1000) };
  }

  /** 出所护理小结：把住店期间的评估、日常记录、用药、计划、服务执行汇总成一份（可打印、可给家属看）。 */
  async summary(motherProfileId: string) {
    const tenantId = this.ctx.tenantId;
    const m = await this.prisma.motherProfile.findFirst({
      where: { id: motherProfileId, tenantId },
      include: {
        customer: { select: { name: true, phone: true } },
        babies: { orderBy: { sequenceNo: 'asc' } },
        occupancy: { select: { occupancyNo: true, status: true, plannedCheckIn: true, plannedCheckOut: true, actualCheckInAt: true, actualCheckOutAt: true, room: { select: { roomNo: true } } } },
        admissionAssessment: true,
        dischargeAssessment: true,
      },
    });
    if (!m) throw new NotFoundException('母婴档案不存在');
    const babyIds = m.babies.map((b) => b.id);
    const [dailies, medications, plans, logs, abnormalities, babyAdm, babyDis] = await Promise.all([
      this.prisma.careDailyRecord.findMany({ where: { motherProfileId }, include: { babies: { include: { feedings: true } } }, orderBy: { recordDate: 'asc' } }),
      this.prisma.careMedicationAuth.findMany({ where: { motherProfileId }, include: { items: true }, orderBy: { createdAt: 'asc' } }),
      this.prisma.carePlanVersion.findMany({ where: { motherProfileId }, orderBy: [{ babyProfileId: 'asc' }, { versionNo: 'asc' }] }),
      this.prisma.careServiceLog.groupBy({ by: ['serviceCode'], where: { motherProfileId }, _count: { _all: true } }),
      this.prisma.careAbnormality.count({ where: { motherProfileId } }),
      this.prisma.careBabyAdmission.findMany({ where: { babyProfileId: { in: babyIds } } }),
      this.prisma.careBabyDischarge.findMany({ where: { babyProfileId: { in: babyIds } } }),
    ]);

    const o = m.occupancy;
    const start = o?.actualCheckInAt ?? o?.plannedCheckIn ?? null;
    const end = o?.actualCheckOutAt ?? o?.plannedCheckOut ?? null;
    const adm = m.admissionAssessment;
    const dis = m.dischargeAssessment;
    const babies = m.babies.map((b) => {
      const days = dailies.map((d) => ({ date: ymd(d.recordDate), rec: d.babies.find((x) => x.babyProfileId === b.id) })).filter((x) => x.rec);
      const jaundice = days.map((x) => ({ date: x.date, v: max(x.rec!.jaundiceForehead, x.rec!.jaundiceCanthus, x.rec!.jaundiceChest) })).filter((x): x is { date: string; v: number } => x.v !== null);
      const weights = days.map((x) => ({ date: x.date, v: x.rec!.weightG })).filter((x): x is { date: string; v: number } => typeof x.v === 'number');
      const formula = days.map((x) => x.rec!.feedings.reduce((a, f) => a + (f.formulaMl ?? 0), 0)).filter((v) => v > 0);
      const urine = days.map((x) => x.rec!.feedings.filter((f) => f.urine === 'YES').length);
      const stool = days.map((x) => x.rec!.feedings.filter((f) => f.stool === 'YES').length);
      const ba = babyAdm.find((x) => x.babyProfileId === b.id);
      const bd = babyDis.find((x) => x.babyProfileId === b.id);
      return {
        id: b.id,
        label: `宝宝${b.sequenceNo}${b.name ? '：' + b.name : ''}`,
        gender: b.gender,
        birthDate: b.birthDate,
        admission: ba ? { weightG: ba.admissionWeightG, lengthCm: ba.admissionLengthCm, headCm: ba.headCircumferenceCm, jaundice: max(ba.jaundiceForehead, ba.jaundiceCanthus, ba.jaundiceChest), feeding: ba.feedingMethod } : null,
        discharge: bd
          ? { weightG: bd.dischargeWeightG, lengthCm: bd.dischargeLengthCm, headCm: bd.dischargeHeadCm, jaundice: max(bd.dischargeJaundiceForehead, bd.dischargeJaundiceCanthus, bd.dischargeJaundiceChest), tips: bd.dischargeTips }
          : null,
        daily: {
          recordedDays: days.length,
          jaundiceMax: max(...jaundice.map((j) => j.v)),
          jaundiceTrend: jaundice,
          weightTrend: weights,
          avgFormulaMlPerDay: avg(formula),
          avgUrinePerDay: avg(urine),
          avgStoolPerDay: avg(stool),
        },
        medications: medications.filter((a) => a.babyProfileId === b.id).map((a) => ({ status: a.status, authDate: a.authDate, items: a.items.map((i) => i.drugName), changeNote: a.changeNote, stopNote: a.stopNote })),
        plans: plans.filter((p) => p.babyProfileId === b.id).map((p) => ({ versionNo: p.versionNo, level: p.level, status: p.status, source: p.source, effectiveAt: p.effectiveAt, focusPoints: p.focusPoints })),
      };
    });
    const temps = dailies.map((d) => d.motherTemperature).filter((x): x is number => typeof x === 'number');
    return {
      motherProfileId,
      customerName: m.customer.name,
      roomNo: o?.room?.roomNo ?? null,
      stay: { start, end, days: start && end ? Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000)) : null },
      delivery: { method: m.deliveryMethod, date: m.deliveryDate, weeks: m.gestationalWeeks },
      mother: {
        admission: adm ? { weightKg: adm.weightKg, bp: adm.bpSystolic && adm.bpDiastolic ? `${adm.bpSystolic}/${adm.bpDiastolic}` : null, temperature: adm.temperature, handlingNotes: adm.handlingNotes } : null,
        discharge: dis ? { weightKg: dis.weightKg, bp: dis.bpSystolic && dis.bpDiastolic ? `${dis.bpSystolic}/${dis.bpDiastolic}` : null, temperature: dis.temperature, fundus: dis.fundus, lochiaAmount: dis.lochiaAmount, otherSpecial: dis.otherSpecial, tips: dis.dischargeTips } : null,
        daily: { recordedDays: dailies.length, avgTemperature: avg(temps), maxSystolic: max(...dailies.map((d) => d.motherBpSystolic)), maxDiastolic: max(...dailies.map((d) => d.motherBpDiastolic)) },
      },
      babies,
      motherPlans: plans.filter((p) => !p.babyProfileId).map((p) => ({ versionNo: p.versionNo, level: p.level, status: p.status, source: p.source, effectiveAt: p.effectiveAt, reviewerName: p.reviewerName, focusPoints: p.focusPoints, progressNote: p.progressNote, adjustReason: p.adjustReason })),
      serviceLogCounts: Object.fromEntries(logs.map((l) => [l.serviceCode, l._count._all])),
      abnormalityCount: abnormalities,
      generatedAt: new Date().toISOString(),
    };
  }
}
