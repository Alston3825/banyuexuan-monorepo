import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CareLevel, CarePlanSource, CarePlanVersion, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { runVersionedUpdate } from '../../common/utils/versioned-update.util';
import { allServiceCodes, expectedCount, freqText, LEVEL_STANDARDS, LevelCode, SERVICE_MEASURE, ServiceStd } from './care-standards';

const DAY_MS = 86_400_000;
const REVIEW_INTERVAL_DAYS = 7;
const LEVELS: CareLevel[] = ['LEVEL1', 'LEVEL2', 'LEVEL3'];
const SOURCES: CarePlanSource[] = ['INITIAL', 'REGULAR_REVIEW', 'DIRECTOR_ROUND'];

export interface PlanBody {
  motherProfileId?: string;
  babyProfileId?: string | null;
  level?: string;
  source?: string;
  assessmentSummary?: string | null;
  focusPoints?: string | null;
  measures?: { title?: string; content?: string; frequency?: string }[];
  progressNote?: string | null;
  adjustReason?: string | null;
  /** 护理主任查房直接调整并生效（需要审核权限） */
  directActivate?: boolean;
  version?: number;
}

const beijingToday = () => new Date(`${new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)}T00:00:00.000Z`);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * 个人化护理计划（版本制）+ 服务执行记录。
 * 流程：护理长起草 → 提交 → 护理主任审核通过后生效（上一版自动变“已替换”，只读保留）；
 * 每 7 天护理长评审一次（写上阶段执行结果 + 新版本），护理主任查房可直接调整并生效；驳回后可修改再提交。
 * 权限：起草/提交用 care.profile.update；审核、驳回、直接生效用 care.profile.approve。
 */
@Injectable()
export class CarePlanVersionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  async standards() {
    return {
      reviewIntervalDays: REVIEW_INTERVAL_DAYS,
      /** 当前账号能否审核/驳回/查房直接调整（护理主任权限），前端据此显示按钮 */
      canApprove: await this.ctx.hasPermission('care.profile.approve'),
      levels: (['LEVEL1', 'LEVEL2', 'LEVEL3'] as LevelCode[]).map((k) => ({
        code: k,
        label: LEVEL_STANDARDS[k].label,
        desc: LEVEL_STANDARDS[k].desc,
        services: LEVEL_STANDARDS[k].services.map((s) => ({ ...s, freqText: freqText(s.freq) })),
      })),
    };
  }

  private async me() {
    const a = await this.prisma.account.findUnique({ where: { id: this.ctx.accountId! }, select: { realName: true } });
    return a?.realName ?? null;
  }

  list(motherProfileId: string) {
    return this.prisma.carePlanVersion.findMany({
      where: { tenantId: this.ctx.tenantId, motherProfileId },
      orderBy: [{ versionNo: 'desc' }],
    });
  }

  private async getOrThrow(id: string) {
    const v = await this.prisma.carePlanVersion.findFirst({ where: { id, tenantId: this.ctx.tenantId } });
    if (!v) throw new NotFoundException('护理计划版本不存在');
    return v;
  }

  private cleanMeasures(m: PlanBody['measures']): Prisma.InputJsonValue | undefined {
    if (m === undefined) return undefined;
    return (m ?? [])
      .map((x) => ({ title: String(x.title ?? '').trim(), content: String(x.content ?? '').trim(), frequency: String(x.frequency ?? '').trim() }))
      .filter((x) => x.title || x.content) as Prisma.InputJsonValue;
  }

  private async assertCanApprove() {
    if (!(await this.ctx.hasPermission('care.profile.approve'))) throw new ForbiddenException('审核护理计划需要护理主任权限');
  }

  async create(dto: PlanBody) {
    if (!dto.motherProfileId) throw new BadRequestException('缺少母婴档案');
    const mother = await this.prisma.motherProfile.findFirst({ where: { id: dto.motherProfileId, tenantId: this.ctx.tenantId } });
    if (!mother) throw new NotFoundException('母婴档案不存在');
    if (dto.babyProfileId) {
      const baby = await this.prisma.babyProfile.findFirst({ where: { id: dto.babyProfileId, motherProfileId: mother.id } });
      if (!baby) throw new BadRequestException('宝宝不属于这个母婴档案');
    }
    if (!LEVELS.includes(dto.level as CareLevel)) throw new BadRequestException('请选择护理等级');
    const subject = { motherProfileId: mother.id, babyProfileId: dto.babyProfileId ?? null };
    const open = await this.prisma.carePlanVersion.findFirst({ where: { ...subject, tenantId: this.ctx.tenantId, status: { in: ['DRAFT', 'PENDING_REVIEW', 'REJECTED'] } } });
    if (open) throw new ConflictException('已有一个还没处理完的计划版本（编辑中/待审核/被驳回），请先处理它');
    const active = await this.prisma.carePlanVersion.findFirst({ where: { ...subject, tenantId: this.ctx.tenantId, status: 'ACTIVE' } });
    const latest = active ?? (await this.prisma.carePlanVersion.findFirst({ where: { ...subject, tenantId: this.ctx.tenantId }, orderBy: { versionNo: 'desc' } }));
    const source: CarePlanSource = SOURCES.includes(dto.source as CarePlanSource) ? (dto.source as CarePlanSource) : active ? 'REGULAR_REVIEW' : 'INITIAL';
    if (active && source === 'REGULAR_REVIEW' && !dto.progressNote?.trim()) throw new BadRequestException('定期评审请填写“上阶段执行结果”');
    if (active && source === 'DIRECTOR_ROUND' && !dto.adjustReason?.trim()) throw new BadRequestException('查房调整请填写调整原因');
    const direct = !!dto.directActivate;
    if (direct) await this.assertCanApprove();

    const name = await this.me();
    const max = await this.prisma.carePlanVersion.aggregate({ where: { ...subject, tenantId: this.ctx.tenantId }, _max: { versionNo: true } });
    const now = new Date();
    const created = await this.prisma.$transaction(async (tx) => {
      if (direct && active) await tx.carePlanVersion.update({ where: { id: active.id }, data: { status: 'SUPERSEDED', endedAt: now, version: { increment: 1 } } });
      return tx.carePlanVersion.create({
        data: {
          tenantId: this.ctx.tenantId!,
          storeId: mother.storeId,
          ...subject,
          versionNo: (max._max.versionNo ?? 0) + 1,
          status: direct ? 'ACTIVE' : 'DRAFT',
          level: dto.level as CareLevel,
          source: direct ? 'DIRECTOR_ROUND' : source,
          assessmentSummary: dto.assessmentSummary?.trim() || null,
          focusPoints: dto.focusPoints?.trim() || null,
          measures: this.cleanMeasures(dto.measures) ?? [],
          progressNote: dto.progressNote?.trim() || null,
          adjustReason: dto.adjustReason?.trim() || null,
          previousVersionId: latest?.id ?? null,
          createdBy: this.ctx.accountId!,
          createdByName: name,
          ...(direct
            ? { submittedAt: now, reviewerId: this.ctx.accountId, reviewerName: name, reviewedAt: now, reviewComment: '护理主任直接调整并生效', effectiveAt: now, nextReviewDue: new Date(beijingToday().getTime() + REVIEW_INTERVAL_DAYS * DAY_MS) }
            : {}),
        },
      });
    });
    await this.audit(direct ? 'STATE_TRANSITION' : 'CREATE', created, direct ? '护理主任直接调整并生效' : '起草护理计划版本');
    return created;
  }

  /** 修改：只能改编辑中/被驳回的版本（生效后和历史版本只读）。 */
  async update(id: string, dto: PlanBody) {
    const before = await this.getOrThrow(id);
    if (dto.version !== before.version) throw new ConflictException('数据已被他人修改，请刷新后重试');
    if (before.status !== 'DRAFT' && before.status !== 'REJECTED') throw new ConflictException('只有编辑中或被驳回的版本可以修改；已提交/已生效的版本不能改，需要调整请新建一个版本');
    if (dto.level !== undefined && !LEVELS.includes(dto.level as CareLevel)) throw new BadRequestException('护理等级不正确');
    const updated = await runVersionedUpdate(() =>
      this.prisma.carePlanVersion.update({
        where: { id, version: before.version },
        data: {
          ...(dto.level ? { level: dto.level as CareLevel } : {}),
          ...(dto.assessmentSummary !== undefined ? { assessmentSummary: dto.assessmentSummary?.trim() || null } : {}),
          ...(dto.focusPoints !== undefined ? { focusPoints: dto.focusPoints?.trim() || null } : {}),
          ...(dto.measures !== undefined ? { measures: this.cleanMeasures(dto.measures) } : {}),
          ...(dto.progressNote !== undefined ? { progressNote: dto.progressNote?.trim() || null } : {}),
          ...(dto.adjustReason !== undefined ? { adjustReason: dto.adjustReason?.trim() || null } : {}),
          status: 'DRAFT',
          version: { increment: 1 },
        },
      }),
    );
    await this.audit('UPDATE', updated, '修改护理计划版本');
    return updated;
  }

  async submit(id: string, version: number) {
    const before = await this.getOrThrow(id);
    if (version !== before.version) throw new ConflictException('数据已被他人修改，请刷新后重试');
    if (before.status !== 'DRAFT' && before.status !== 'REJECTED') throw new ConflictException('这个版本不是编辑中状态');
    if (!before.focusPoints?.trim() && !before.assessmentSummary?.trim()) throw new BadRequestException('请至少填写评估依据或重点关注后再提交');
    const updated = await runVersionedUpdate(() =>
      this.prisma.carePlanVersion.update({ where: { id, version }, data: { status: 'PENDING_REVIEW', submittedAt: new Date(), version: { increment: 1 } } }),
    );
    await this.audit('STATE_TRANSITION', updated, '提交护理主任审核');
    return updated;
  }

  async approve(id: string, version: number, comment?: string) {
    await this.assertCanApprove();
    const before = await this.getOrThrow(id);
    if (version !== before.version) throw new ConflictException('数据已被他人修改，请刷新后重试');
    if (before.status !== 'PENDING_REVIEW') throw new ConflictException('这个版本不在待审核状态');
    const name = await this.me();
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.carePlanVersion.updateMany({
        where: { tenantId: this.ctx.tenantId!, motherProfileId: before.motherProfileId, babyProfileId: before.babyProfileId, status: 'ACTIVE' },
        data: { status: 'SUPERSEDED', endedAt: now },
      });
      return tx.carePlanVersion.update({
        where: { id, version },
        data: {
          status: 'ACTIVE',
          reviewerId: this.ctx.accountId,
          reviewerName: name,
          reviewedAt: now,
          reviewComment: comment?.trim() || null,
          effectiveAt: now,
          nextReviewDue: new Date(beijingToday().getTime() + REVIEW_INTERVAL_DAYS * DAY_MS),
          version: { increment: 1 },
        },
      });
    });
    await this.audit('STATE_TRANSITION', updated, '审核通过，计划生效');
    return updated;
  }

  async reject(id: string, version: number, comment: string) {
    await this.assertCanApprove();
    if (!comment?.trim()) throw new BadRequestException('驳回请写明原因');
    const before = await this.getOrThrow(id);
    if (version !== before.version) throw new ConflictException('数据已被他人修改，请刷新后重试');
    if (before.status !== 'PENDING_REVIEW') throw new ConflictException('这个版本不在待审核状态');
    const name = await this.me();
    const updated = await runVersionedUpdate(() =>
      this.prisma.carePlanVersion.update({
        where: { id, version },
        data: { status: 'REJECTED', reviewerId: this.ctx.accountId, reviewerName: name, reviewedAt: new Date(), reviewComment: comment.trim(), version: { increment: 1 } },
      }),
    );
    await this.audit('STATE_TRANSITION', updated, `驳回：${comment.trim()}`);
    return updated;
  }

  /** 待办：评审到期的在用计划 + 待审核的版本（护理看板/待办提醒用）。 */
  async due(storeId?: string) {
    const today = beijingToday();
    const where = { tenantId: this.ctx.tenantId, storeId };
    const [reviewDue, pending] = await Promise.all([
      this.prisma.carePlanVersion.findMany({ where: { ...where, status: 'ACTIVE', nextReviewDue: { lte: today } }, orderBy: { nextReviewDue: 'asc' } }),
      this.prisma.carePlanVersion.findMany({ where: { ...where, status: 'PENDING_REVIEW' }, orderBy: { submittedAt: 'asc' } }),
    ]);
    return { reviewDue, pending };
  }

  /** 一批妈妈档案当前生效的计划（妈妈计划）：护理看板取护理等级/重点关注/评审到期。 */
  async activeForMothers(motherProfileIds: string[]) {
    if (motherProfileIds.length === 0) return new Map<string, CarePlanVersion>();
    const list = await this.prisma.carePlanVersion.findMany({
      where: { tenantId: this.ctx.tenantId, motherProfileId: { in: motherProfileIds }, babyProfileId: null, status: 'ACTIVE' },
    });
    return new Map(list.map((v) => [v.motherProfileId, v]));
  }

  private audit(action: 'CREATE' | 'UPDATE' | 'STATE_TRANSITION', v: CarePlanVersion, remark: string) {
    return this.auditLogService.record({
      action,
      entityType: 'CarePlanVersion',
      entityId: v.id,
      afterData: { versionNo: v.versionNo, level: v.level, status: v.status, babyProfileId: v.babyProfileId } as Prisma.InputJsonValue,
      remark: `第 ${v.versionNo} 版：${remark}`,
      tenantId: this.ctx.tenantId,
      storeId: v.storeId,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    });
  }
}

// ======================= 服务执行记录 =======================

export interface ServiceLogBody {
  motherProfileId: string;
  babyProfileId?: string | null;
  serviceCode: string;
  doneDate?: string;
  doneTime?: string; // HH:mm
  systolic?: number;
  diastolic?: number;
  weightKg?: number;
  doneByName?: string;
  clientSigned?: boolean;
  note?: string;
}

@Injectable()
export class CareServiceLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
    private readonly plans: CarePlanVersionService,
  ) {}

  private async mother(id: string) {
    const m = await this.prisma.motherProfile.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
      include: { babies: { orderBy: { sequenceNo: 'asc' } }, occupancy: { select: { plannedCheckIn: true, plannedCheckOut: true, actualCheckInAt: true, actualCheckOutAt: true } } },
    });
    if (!m) throw new NotFoundException('母婴档案不存在');
    return m;
  }

  /** 各服务项目的执行情况：标准频次、按入住天数应做次数、已做次数和每次的日期/签名。 */
  async summary(motherProfileId: string) {
    const m = await this.mother(motherProfileId);
    const o = m.occupancy;
    const startRaw = o?.actualCheckInAt ?? o?.plannedCheckIn ?? m.createdAt;
    const start = new Date(`${new Date(startRaw.getTime() + 8 * 3600_000).toISOString().slice(0, 10)}T00:00:00.000Z`);
    const outRaw = o?.actualCheckOutAt;
    const end = outRaw ? new Date(`${new Date(outRaw.getTime() + 8 * 3600_000).toISOString().slice(0, 10)}T00:00:00.000Z`) : beijingToday();
    const stayDay = Math.max(1, Math.round((Math.min(end.getTime(), beijingToday().getTime()) - start.getTime()) / DAY_MS) + 1);

    const plans = await this.prisma.carePlanVersion.findMany({ where: { tenantId: this.ctx.tenantId, motherProfileId, status: 'ACTIVE' } });
    const motherLevel = (plans.find((p) => !p.babyProfileId)?.level ?? 'LEVEL3') as LevelCode;
    const levelOf = (babyId: string | null): LevelCode => (babyId ? ((plans.find((p) => p.babyProfileId === babyId)?.level ?? motherLevel) as LevelCode) : motherLevel);
    const logs = await this.prisma.careServiceLog.findMany({ where: { tenantId: this.ctx.tenantId, motherProfileId }, orderBy: [{ doneDate: 'asc' }, { createdAt: 'asc' }] });

    const rows: Record<string, unknown>[] = [];
    const push = (std: ServiceStd, babyId: string | null, babyLabel: string | null) => {
      const level = levelOf(babyId);
      const stdAtLevel = LEVEL_STANDARDS[level].services.find((s) => s.code === std.code) ?? std;
      const mine = logs.filter((l) => l.serviceCode === std.code && (l.babyProfileId ?? null) === babyId);
      rows.push({
        code: std.code,
        name: std.name,
        subject: std.subject,
        group: std.group,
        level,
        babyProfileId: babyId,
        babyLabel,
        freqText: freqText(stdAtLevel.freq),
        expected: expectedCount(stdAtLevel.freq, stayDay),
        done: mine.length,
        measure: SERVICE_MEASURE[std.code] ?? null,
        logs: mine.map((l) => ({
          id: l.id,
          date: ymd(l.doneDate),
          time: l.doneTime,
          systolic: l.systolic,
          diastolic: l.diastolic,
          weightKg: l.weightKg === null ? null : Number(l.weightKg),
          doneByName: l.doneByName,
          clientSigned: l.clientSigned,
          note: l.note,
        })),
      });
    };
    // 项目清单取三级（所有项目都有），频次按各对象当前等级
    for (const std of LEVEL_STANDARDS.LEVEL3.services) {
      if (std.subject === 'MOTHER') push(std, null, null);
      else for (const b of m.babies) push(std, b.id, `宝宝${b.sequenceNo}${b.name ? '：' + b.name : ''}`);
    }
    return { motherProfileId, stayDay, startDate: ymd(start), motherLevel, rows };
  }

  async create(dto: ServiceLogBody) {
    const m = await this.mother(dto.motherProfileId);
    const std = LEVEL_STANDARDS.LEVEL3.services.find((s) => s.code === dto.serviceCode);
    if (!std || !allServiceCodes().has(dto.serviceCode)) throw new BadRequestException('未知的服务项目');
    if (std.subject === 'BABY') {
      if (!dto.babyProfileId || !m.babies.some((b) => b.id === dto.babyProfileId)) throw new BadRequestException('请选择是哪个宝宝');
    } else if (dto.babyProfileId) throw new BadRequestException('这是妈妈的服务项目，不要选宝宝');
    const day = dto.doneDate ? dto.doneDate.slice(0, 10) : ymd(beijingToday());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(new Date(day).getTime())) throw new BadRequestException('日期格式不正确');
    if (day > ymd(beijingToday())) throw new BadRequestException('不能记录未来的日期');
    const time = dto.doneTime?.trim() || null;
    if (!time) throw new BadRequestException('请填写做的时间');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new BadRequestException('时间格式不正确，应为 HH:mm');
    if (day === ymd(beijingToday()) && time > new Date(Date.now() + 8 * 3600_000).toISOString().slice(11, 16)) throw new BadRequestException('不能记录未来的时间');
    // 测量类项目必须带数值，其余项目不接收数值
    const measure = SERVICE_MEASURE[std.code];
    let systolic: number | null = null;
    let diastolic: number | null = null;
    let weightKg: number | null = null;
    if (measure === 'BP') {
      systolic = dto.systolic ?? null;
      diastolic = dto.diastolic ?? null;
      if (systolic === null || diastolic === null) throw new BadRequestException('请填写收缩压和舒张压');
      if (systolic < 60 || systolic > 260) throw new BadRequestException('收缩压应在 60~260 mmHg 之间');
      if (diastolic < 30 || diastolic > 160) throw new BadRequestException('舒张压应在 30~160 mmHg 之间');
      if (diastolic >= systolic) throw new BadRequestException('舒张压应低于收缩压，请检查是否填反');
    } else if (measure === 'WEIGHT') {
      weightKg = dto.weightKg ?? null;
      if (weightKg === null) throw new BadRequestException('请填写体重');
      if (weightKg < 30 || weightKg > 200) throw new BadRequestException('体重应在 30~200 kg 之间');
      weightKg = Math.round(weightKg * 100) / 100;
    }
    if (std.freq.kind === 'ONCE') {
      const dup = await this.prisma.careServiceLog.count({ where: { motherProfileId: m.id, serviceCode: std.code, babyProfileId: dto.babyProfileId ?? null } });
      if (dup > 0) throw new ConflictException('这个宣教项目已经记录过了（入住期间只需 1 次）');
    }
    const created = await this.prisma.careServiceLog.create({
      data: {
        tenantId: this.ctx.tenantId!,
        storeId: m.storeId,
        motherProfileId: m.id,
        babyProfileId: dto.babyProfileId ?? null,
        serviceCode: std.code,
        doneDate: new Date(`${day}T00:00:00.000Z`),
        doneTime: time,
        systolic,
        diastolic,
        weightKg,
        doneByName: dto.doneByName?.trim() || null,
        clientSigned: !!dto.clientSigned,
        note: dto.note?.trim() || null,
        createdBy: this.ctx.accountId!,
      },
    });
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'CareServiceLog',
      entityId: created.id,
      afterData: { serviceCode: std.code, doneDate: day, doneTime: time, systolic, diastolic, weightKg } as Prisma.InputJsonValue,
      remark: `${std.name} ${day} ${time}`,
      tenantId: this.ctx.tenantId,
      storeId: m.storeId,
      accountId: this.ctx.accountId,
      requestId: this.ctx.requestId,
    });
    return created;
  }

  async remove(id: string) {
    const log = await this.prisma.careServiceLog.findFirst({ where: { id, tenantId: this.ctx.tenantId } });
    if (!log) throw new NotFoundException('记录不存在');
    await this.prisma.careServiceLog.delete({ where: { id } });
    await this.auditLogService.record({
      action: 'DELETE',
      entityType: 'CareServiceLog',
      entityId: id,
      beforeData: { serviceCode: log.serviceCode, doneDate: ymd(log.doneDate) } as Prisma.InputJsonValue,
      tenantId: this.ctx.tenantId,
      storeId: log.storeId,
      accountId: this.ctx.accountId,
      requestId: this.ctx.requestId,
    });
  }

  /** 让计划服务可复用 */
  get planService() {
    return this.plans;
  }
}
