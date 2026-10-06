import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { toDbData } from '../care-assessment/assessment-codec';
import { FormSpec } from '../care-assessment/assessment-specs';
import { CareMedicationService } from '../care-medication/care-medication.service';
import { DAILY_BABY_FIELDS, DAILY_MOTHER_FIELDS, FEEDING_COLUMNS } from './daily-specs';

const DAY_MS = 86_400_000;
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

// 复用评估表的字段校验/转换器：只要有 groups 就能用
const motherSpec = { groups: DAILY_MOTHER_FIELDS } as unknown as FormSpec;
const babySpec = { groups: DAILY_BABY_FIELDS } as unknown as FormSpec;
const feedingSpec = { groups: [{ title: '喂养', fields: FEEDING_COLUMNS }] } as unknown as FormSpec;

export interface FeedingInput {
  [key: string]: unknown;
}
export interface SaveDayDto {
  motherProfileId: string;
  date: string;
  documentId?: string | null;
  /** 当天记录已存在时带上版本号（乐观锁）；新建时不带 */
  version?: number;
  mother: Record<string, unknown>;
  babies: { babyProfileId: string; values: Record<string, unknown>; feedings?: FeedingInput[] }[];
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const utcDay = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new BadRequestException('日期格式应为 YYYY-MM-DD');
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('日期不存在');
  return d;
};
const todayUtc = () => utcDay(new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)); // 按北京时间的"今天"

/**
 * 日常护理记录：每个妈妈档案每天一份（妈妈栏 + 每个宝宝一栏 + 宝宝 24 小时喂养记录单），
 * 住几天就有几份。"当天的记录"打开时若还没有，前端显示空白表单，保存时才真正创建（懒创建）；
 * 日历列表按入住天数列出每一天，已填/未填一目了然。整天保存（妈妈 + 宝宝 + 喂养行）在一个事务里。
 */
@Injectable()
export class CareDailyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
    private readonly medication: CareMedicationService,
  ) {}

  specs() {
    return { mother: DAILY_MOTHER_FIELDS, baby: DAILY_BABY_FIELDS, feeding: FEEDING_COLUMNS };
  }

  private async mother(id: string) {
    const m = await this.prisma.motherProfile.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
      include: {
        babies: { orderBy: { sequenceNo: 'asc' } },
        occupancy: { select: { plannedCheckIn: true, plannedCheckOut: true, actualCheckInAt: true, actualCheckOutAt: true, room: { select: { roomNo: true } } } },
      },
    });
    if (!m) throw new NotFoundException('母婴档案不存在');
    return m;
  }

  /** 入住日（用于算"入住第几天"和日历起点）：实际入住日 > 预计入住日 > 建档日 */
  private startDate(m: Awaited<ReturnType<CareDailyService['mother']>>): Date {
    const o = m.occupancy;
    const raw = o?.actualCheckInAt ?? o?.plannedCheckIn ?? m.createdAt;
    return utcDay(new Date(raw.getTime() + 8 * 3600_000).toISOString().slice(0, 10));
  }

  private endDate(m: Awaited<ReturnType<CareDailyService['mother']>>, start: Date): Date {
    const today = todayUtc();
    const o = m.occupancy;
    const out = o?.actualCheckOutAt ?? o?.plannedCheckOut;
    let end = today;
    if (out) {
      const outDay = utcDay(new Date(out.getTime() + 8 * 3600_000).toISOString().slice(0, 10));
      if (outDay.getTime() < today.getTime()) end = outDay; // 已离店：只列到离店那天
    }
    return end.getTime() < start.getTime() ? start : end;
  }

  /** 日历列表：从入住日到今天（已离店到离店日）每天一行，标出哪天填了、哪天没填。 */
  async days(motherProfileId: string) {
    const m = await this.mother(motherProfileId);
    const start = this.startDate(m);
    const end = this.endDate(m, start);
    const records = await this.prisma.careDailyRecord.findMany({
      where: { motherProfileId },
      select: { id: true, recordDate: true, babies: { select: { babyProfileId: true } } },
    });
    const byDate = new Map(records.map((r) => [ymd(r.recordDate), r]));
    const dates = new Set<string>();
    for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) dates.add(ymd(new Date(t)));
    for (const k of byDate.keys()) dates.add(k); // 范围外已填的也列出来
    const sorted = [...dates].sort().reverse();
    return {
      motherProfileId,
      roomNo: m.occupancy?.room?.roomNo ?? null,
      startDate: ymd(start),
      today: ymd(todayUtc()),
      babyCount: m.babies.length,
      days: sorted.map((date) => {
        const r = byDate.get(date);
        return {
          date,
          stayDay: Math.round((utcDay(date).getTime() - start.getTime()) / DAY_MS) + 1,
          filled: !!r,
          babiesFilled: r ? r.babies.length : 0,
        };
      }),
    };
  }

  private babySummary(feedings: { formulaMl: number | null; breastMilkMl: number | null; waterMl: number | null; urine: string | null; stool: string | null }[]) {
    const sum = (k: 'formulaMl' | 'breastMilkMl' | 'waterMl') => feedings.reduce((a, f) => a + (f[k] ?? 0), 0);
    return {
      formulaTotalMl: sum('formulaMl'),
      breastMilkTotalMl: sum('breastMilkMl'),
      waterTotalMl: sum('waterMl'),
      urineCount: feedings.filter((f) => f.urine === 'YES').length,
      stoolCount: feedings.filter((f) => f.stool === 'YES').length,
      feedCount: feedings.filter((f) => (f.formulaMl ?? 0) + (f.breastMilkMl ?? 0) > 0).length,
    };
  }

  /** 某一天的完整记录（没有就返回 record=null，附上入住第几天、宝宝出生天数等默认值供前端预填）。 */
  async day(motherProfileId: string, date: string) {
    const m = await this.mother(motherProfileId);
    const d = utcDay(date);
    const start = this.startDate(m);
    const record = await this.prisma.careDailyRecord.findUnique({
      where: { motherProfileId_recordDate: { motherProfileId, recordDate: d } },
      include: { babies: { include: { feedings: { orderBy: [{ time: 'asc' }, { sortOrder: 'asc' }] } } }, document: { select: { id: true } } },
    });
    const stayDay = Math.round((d.getTime() - start.getTime()) / DAY_MS) + 1;
    const activeMeds = await this.medication.activeItems(m.babies.map((b) => b.id), date);
    return {
      motherProfileId,
      date,
      roomNo: m.occupancy?.room?.roomNo ?? null,
      defaults: { stayDay },
      record: record ? { ...record, babies: undefined } : null,
      babies: m.babies.map((b) => {
        const br = record?.babies.find((x) => x.babyProfileId === b.id) ?? null;
        const ageDays = b.birthDate ? Math.round((d.getTime() - utcDay(ymd(b.birthDate)).getTime()) / DAY_MS) : null;
        return {
          baby: { id: b.id, sequenceNo: b.sequenceNo, name: b.name, gender: b.gender, birthDate: b.birthDate },
          defaultAgeDays: ageDays !== null && ageDays >= 0 ? ageDays : null,
          record: br ? { ...br, feedings: undefined } : null,
          feedings: br?.feedings ?? [],
          summary: this.babySummary(br?.feedings ?? []),
          /** 这一天仍有效的用药委托（日常记录“用药”栏据此选药/核对） */
          activeMedications: activeMeds[b.id] ?? [],
        };
      }),
    };
  }

  /** 整天保存：妈妈栏 + 各宝宝栏 + 喂养行，一个事务；当天已有记录必须带版本号。 */
  async saveDay(dto: SaveDayDto) {
    const m = await this.mother(dto.motherProfileId);
    const d = utcDay(dto.date);
    const start = this.startDate(m);
    const motherData = toDbData(motherSpec, dto.mother ?? {});
    const babyIds = new Set(m.babies.map((b) => b.id));
    const babyData = (dto.babies ?? []).map((b) => {
      if (!babyIds.has(b.babyProfileId)) throw new BadRequestException('宝宝不属于这个母婴档案');
      const feedings = (b.feedings ?? []).map((f, i) => {
        const data = toDbData(feedingSpec, f);
        if (data.time && !TIME_RE.test(String(data.time))) throw new BadRequestException(`第 ${i + 1} 行喂养记录的时间「${data.time}」格式不对，应为 HH:mm（如 14:20）`);
        if (!data.time) throw new BadRequestException(`第 ${i + 1} 行喂养记录没有填时间`);
        const t = String(data.time);
        return { ...data, time: t.length === 4 ? `0${t}` : t, sortOrder: i };
      });
      return { babyProfileId: b.babyProfileId, data: toDbData(babySpec, b.values ?? {}), feedings };
    });
    if (dto.documentId) {
      const doc = await this.prisma.careDocument.findFirst({ where: { id: dto.documentId, tenantId: this.ctx.tenantId, motherProfileId: dto.motherProfileId } });
      if (!doc || doc.docType !== 'DAILY_RECORD') throw new BadRequestException('关联的纸质资料不存在或类型不是日常护理记录');
    }

    const existing = await this.prisma.careDailyRecord.findUnique({
      where: { motherProfileId_recordDate: { motherProfileId: dto.motherProfileId, recordDate: d } },
      include: { babies: true },
    });
    if (existing && dto.version !== existing.version) throw new ConflictException('这一天的记录已被他人修改，请刷新后重试');
    if (!existing && dto.version !== undefined && dto.version !== null) throw new ConflictException('这一天的记录不存在，请刷新后重试');

    const stayDay = Math.round((d.getTime() - start.getTime()) / DAY_MS) + 1;
    const tenantId = this.ctx.tenantId!;
    const accountId = this.ctx.accountId!;
    const saved = await this.prisma.$transaction(async (tx) => {
      const record = existing
        ? await tx.careDailyRecord.update({
            where: { id: existing.id, version: existing.version },
            data: { ...motherData, ...(dto.documentId !== undefined ? { documentId: dto.documentId } : {}), version: { increment: 1 } },
          })
        : await tx.careDailyRecord.create({
            data: { ...motherData, tenantId, storeId: m.storeId, motherProfileId: m.id, recordDate: d, stayDay, documentId: dto.documentId ?? null, createdBy: accountId },
          });
      for (const b of babyData) {
        const prev = existing?.babies.find((x) => x.babyProfileId === b.babyProfileId);
        const br = prev
          ? await tx.careDailyBabyRecord.update({ where: { id: prev.id }, data: { ...b.data, ...(dto.documentId !== undefined ? { documentId: dto.documentId } : {}), version: { increment: 1 } } })
          : await tx.careDailyBabyRecord.create({
              data: { ...b.data, tenantId, storeId: m.storeId, dailyRecordId: record.id, babyProfileId: b.babyProfileId, documentId: dto.documentId ?? null, createdBy: accountId },
            });
        await tx.careFeedingEntry.deleteMany({ where: { babyDailyId: br.id } });
        if (b.feedings.length > 0) {
          await tx.careFeedingEntry.createMany({ data: b.feedings.map((f) => ({ ...(f as object), tenantId, babyDailyId: br.id }) as Prisma.CareFeedingEntryCreateManyInput) });
        }
      }
      return record;
    });
    if (dto.documentId) {
      await this.prisma.careDocument.updateMany({
        where: { id: dto.documentId, tenantId, status: 'DRAFT' },
        data: { status: 'CONFIRMED', confirmedBy: accountId, confirmedAt: new Date() },
      });
    }
    await this.auditLogService.record({
      action: existing ? 'UPDATE' : 'CREATE',
      entityType: 'CareDailyRecord',
      entityId: saved.id,
      afterData: { date: dto.date, motherProfileId: m.id, babies: babyData.length, feedings: babyData.reduce((a, b) => a + b.feedings.length, 0) },
      remark: `日常护理记录 ${dto.date}`,
      tenantId,
      storeId: m.storeId,
      accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    });
    return this.day(dto.motherProfileId, dto.date);
  }

  /** 当天还没填日常护理记录的在住妈妈（护理看板“今日未填”和待办用）。 */
  async pending(storeId: string | undefined, date?: string) {
    const d = date ? utcDay(date) : todayUtc();
    const profiles = await this.prisma.motherProfile.findMany({
      where: { tenantId: this.ctx.tenantId, storeId, occupancy: { status: 'CHECKED_IN' } },
      select: { id: true, customer: { select: { name: true } }, occupancy: { select: { room: { select: { roomNo: true } } } }, dailyRecords: { where: { recordDate: d }, select: { id: true } } },
    });
    return profiles
      .filter((p) => p.dailyRecords.length === 0)
      .map((p) => ({ motherProfileId: p.id, customerName: p.customer.name, roomNo: p.occupancy?.room?.roomNo ?? null }));
  }
}
