import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CareSignShift, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { DataScopeService } from '../../common/scope/data-scope.service';
import { assertSignatureImage, cleanDeviceId, contentHash, randomToken, sha256 } from './signature.util';

const DAY_MS = 86_400_000;
export const CONFIRM_WINDOW_DAYS = 7; // 客户最多补确认 7 天内的记录；护理师补签字同理（护理主任可超期）
export const LINK_TTL_DAYS = 7;

export const dayRecordInclude = { babies: { include: { feedings: true } } } satisfies Prisma.CareDailyRecordInclude;
export type DayRecord = Prisma.CareDailyRecordGetPayload<{ include: typeof dayRecordInclude }>;

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const todayYmd = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
const dayDiff = (a: string, b: string) => Math.round((new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / DAY_MS);

/** 同一份记录内容 → 同一个指纹（宝宝、喂养行按固定顺序排好再算） */
export function hashDayRecord(rec: DayRecord): string {
  // 只算记录本身的内容：签字、确认这些“附带数据”不能算进指纹，否则签字本身就会改变指纹
  const { babies: _babies, signatures: _signatures, confirmations: _confirmations, ...own } = rec as DayRecord & { signatures?: unknown; confirmations?: unknown };
  return contentHash({
    ...own,
    babies: [...rec.babies]
      .sort((a, b) => a.babyProfileId.localeCompare(b.babyProfileId))
      .map((b) => ({ ...b, feedings: [...b.feedings].sort((x, y) => x.sortOrder - y.sortOrder) })),
  });
}

/**
 * 护理档案“签字”：
 * ① 员工自己录一次电子签名图（“我的电子签名”）；
 * ② 日常护理记录由护理师用自己的账号签字（选白班/夜班/替班），一位妈妈一天可以有多位护理师各签一条
 *    ——一对多服务、早晚班不同人、休假替班的第三第四位护理师都按这个来；只能签自己的，签字图/姓名/时间/内容指纹留痕；
 * ③ 生成发给客户的确认链接（客户确认见 care-confirm-public.service.ts）。
 */
@Injectable()
export class CareSignatureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly dataScope: DataScopeService,
    private readonly ctx: RequestContextService,
  ) {}

  // ---------------- 我的电子签名 ----------------
  async mySignature() {
    const a = await this.prisma.account.findUnique({ where: { id: this.ctx.accountId! }, select: { signatureData: true, signatureUpdatedAt: true } });
    return { hasSignature: !!a?.signatureData, signatureData: a?.signatureData ?? null, updatedAt: a?.signatureUpdatedAt ?? null };
  }

  async setMySignature(data: unknown) {
    const image = assertSignatureImage(data);
    await this.prisma.account.update({ where: { id: this.ctx.accountId! }, data: { signatureData: image, signatureUpdatedAt: new Date() } });
    await this.auditLogService.record({
      action: 'UPDATE',
      entityType: 'Account',
      entityId: this.ctx.accountId!,
      changedFields: ['signatureData'],
      remark: '录入/更新电子签名',
      tenantId: this.ctx.tenantId,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    });
    return this.mySignature();
  }

  // ---------------- 日常记录：护理师签字 ----------------
  private async mother(id: string) {
    const m = await this.prisma.motherProfile.findFirst({ where: { id, tenantId: this.ctx.tenantId }, include: { customer: { select: { name: true, phone: true } } } });
    if (!m) throw new NotFoundException('母婴档案不存在');
    await this.dataScope.assertStoreAccessible(this.ctx, m.storeId);
    return m;
  }

  private async record(motherProfileId: string, date: string): Promise<DayRecord | null> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('日期格式应为 YYYY-MM-DD');
    return this.prisma.careDailyRecord.findUnique({ where: { motherProfileId_recordDate: { motherProfileId, recordDate: new Date(`${date}T00:00:00.000Z`) } }, include: dayRecordInclude });
  }

  /** 某一天的签字/确认情况（护理师签字列表 + 客户最新确认，标出“签字后内容又被改过”的）。 */
  async dayStatus(motherProfileId: string, date: string) {
    await this.mother(motherProfileId);
    const rec = await this.record(motherProfileId, date);
    if (!rec) return { recordExists: false, signatures: [], confirmation: null };
    const hash = hashDayRecord(rec);
    const [sigs, conf] = await Promise.all([
      this.prisma.careDailySignature.findMany({ where: { dailyRecordId: rec.id }, orderBy: { signedAt: 'asc' } }),
      this.prisma.careDailyConfirmation.findFirst({ where: { dailyRecordId: rec.id }, orderBy: { confirmedAt: 'desc' } }),
    ]);
    return {
      recordExists: true,
      signatures: sigs.map((s) => ({
        id: s.id,
        shift: s.shift,
        nurseAccountId: s.nurseAccountId,
        nurseName: s.nurseName,
        signatureData: s.signatureData,
        signedAt: s.signedAt,
        stale: s.contentHash !== hash,
        mine: s.nurseAccountId === this.ctx.accountId,
      })),
      confirmation: conf
        ? {
            id: conf.id,
            method: conf.method,
            satisfaction: conf.satisfaction,
            nurseRatings: (conf.nurseRatings as unknown) ?? null,
            comment: conf.comment,
            signatureData: conf.signatureData,
            confirmedAt: conf.confirmedAt,
            stale: conf.contentHash !== hash,
            riskFlags: (conf.riskFlags as string[] | null) ?? [],
            dwellMs: conf.dwellMs,
            holdMs: conf.holdMs,
            ip: conf.ip,
            userAgent: conf.userAgent,
          }
        : null,
    };
  }

  /** 日历里每一天的签字/确认小标记（一次取一个档案全部天，避免逐天请求）。 */
  async overview(motherProfileId: string) {
    await this.mother(motherProfileId);
    const records = await this.prisma.careDailyRecord.findMany({
      where: { motherProfileId },
      include: { ...dayRecordInclude, signatures: { select: { contentHash: true } }, confirmations: { orderBy: { confirmedAt: 'desc' }, take: 1, select: { contentHash: true, satisfaction: true, method: true } } },
    });
    return records.map((r) => {
      const hash = hashDayRecord(r);
      const conf = r.confirmations[0];
      return {
        date: ymd(r.recordDate),
        signatureCount: r.signatures.length,
        staleSignatures: r.signatures.filter((s) => s.contentHash !== hash).length,
        confirmation: !conf ? 'NONE' : conf.contentHash === hash ? 'CONFIRMED' : 'STALE',
        satisfaction: conf?.satisfaction ?? null,
        confirmMethod: conf?.method ?? null,
      };
    });
  }

  async sign(input: { motherProfileId: string; date: string; shift: CareSignShift; deviceId?: string }) {
    if (!['DAY', 'NIGHT', 'RELIEF'].includes(input.shift)) throw new BadRequestException('请选择班次：白班、夜班或替班');
    const m = await this.mother(input.motherProfileId);
    const rec = await this.record(input.motherProfileId, input.date);
    if (!rec) throw new BadRequestException('这一天还没有保存护理记录，先填写并保存再签字');
    const diff = dayDiff(todayYmd(), input.date);
    if (diff < 0) throw new BadRequestException('不能给未来的日期签字');
    if (diff > CONFIRM_WINDOW_DAYS && !(await this.ctx.hasPermission('care.profile.approve'))) {
      throw new ForbiddenException(`超过 ${CONFIRM_WINDOW_DAYS} 天的记录不能再补签，请联系护理主任`);
    }
    const me = await this.prisma.account.findUnique({ where: { id: this.ctx.accountId! }, select: { id: true, realName: true, signatureData: true } });
    if (!me?.signatureData) throw new BadRequestException('您还没有录入电子签名，请先到右上角“我的电子签名”录入一次');

    const hash = hashDayRecord(rec);
    const existing = await this.prisma.careDailySignature.findUnique({ where: { dailyRecordId_nurseAccountId: { dailyRecordId: rec.id, nurseAccountId: me.id } } });
    if (existing && existing.contentHash === hash) throw new ConflictException('您已经在这一天的记录上签过字了');
    const data = {
      shift: input.shift,
      nurseName: me.realName,
      signatureData: me.signatureData,
      contentHash: hash,
      signedAt: new Date(),
      ip: this.ctx.ip ?? null,
      deviceId: cleanDeviceId(input.deviceId),
    };
    const saved = existing
      ? await this.prisma.careDailySignature.update({ where: { id: existing.id }, data })
      : await this.prisma.careDailySignature.create({ data: { ...data, tenantId: this.ctx.tenantId!, storeId: m.storeId, dailyRecordId: rec.id, nurseAccountId: me.id } });
    await this.auditLogService.record({
      action: existing ? 'UPDATE' : 'CREATE',
      entityType: 'CareDailySignature',
      entityId: saved.id,
      afterData: { date: input.date, shift: input.shift, nurse: me.realName, contentHash: hash } as Prisma.InputJsonValue,
      remark: `${me.realName} 在 ${input.date} 日常护理记录上签字（${{ DAY: '白班', NIGHT: '夜班', RELIEF: '替班' }[input.shift]}）`,
      tenantId: this.ctx.tenantId,
      storeId: m.storeId,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    });
    return this.dayStatus(input.motherProfileId, input.date);
  }

  /** 撤销签字：只能撤自己的（护理主任可以撤别人的）；客户已确认过的这一天不允许撤。 */
  async unsign(signatureId: string) {
    const s = await this.prisma.careDailySignature.findFirst({ where: { id: signatureId, tenantId: this.ctx.tenantId }, include: { dailyRecord: true } });
    if (!s) throw new NotFoundException('签字记录不存在');
    if (s.nurseAccountId !== this.ctx.accountId && !(await this.ctx.hasPermission('care.profile.approve'))) throw new ForbiddenException('只能撤销自己的签字');
    const confirmed = await this.prisma.careDailyConfirmation.count({ where: { dailyRecordId: s.dailyRecordId } });
    if (confirmed > 0) throw new BadRequestException('客户已经确认过这一天的记录，签字不能再撤销');
    await this.prisma.careDailySignature.delete({ where: { id: s.id } });
    await this.auditLogService.record({
      action: 'DELETE',
      entityType: 'CareDailySignature',
      entityId: s.id,
      beforeData: { date: ymd(s.dailyRecord.recordDate), shift: s.shift, nurse: s.nurseName } as Prisma.InputJsonValue,
      remark: `撤销 ${s.nurseName} 的签字`,
      tenantId: this.ctx.tenantId,
      storeId: s.storeId,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    });
    return { ok: true };
  }

  // ---------------- 发给客户的确认链接 ----------------
  async createLink(motherProfileId: string) {
    const m = await this.mother(motherProfileId);
    const digits = (m.customer.phone ?? '').replace(/\D/g, '');
    if (digits.length < 4) throw new BadRequestException('这位客户没有登记完整的手机号，客户无法核验本人。请先到客户档案补全手机号');
    // 新链接生效，同一个档案之前没用完的旧链接作废（避免同时存在多个有效链接）
    await this.prisma.careConfirmLink.updateMany({ where: { motherProfileId, revokedAt: null, expiresAt: { gt: new Date() } }, data: { revokedAt: new Date() } });
    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + LINK_TTL_DAYS * DAY_MS);
    const link = await this.prisma.careConfirmLink.create({
      data: { tenantId: this.ctx.tenantId!, storeId: m.storeId, motherProfileId, tokenHash: sha256(token), expiresAt, createdBy: this.ctx.accountId! },
    });
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'CareConfirmLink',
      entityId: link.id,
      remark: `生成客户护理记录确认链接（${m.customer.name}，${LINK_TTL_DAYS} 天有效）`,
      tenantId: this.ctx.tenantId,
      storeId: m.storeId,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    });
    return { id: link.id, token, path: `/c/${token}`, expiresAt };
  }

  async listLinks(motherProfileId: string) {
    await this.mother(motherProfileId);
    const links = await this.prisma.careConfirmLink.findMany({ where: { motherProfileId }, orderBy: { createdAt: 'desc' }, take: 5 });
    const now = new Date();
    return links.map((l) => ({
      id: l.id,
      createdAt: l.createdAt,
      expiresAt: l.expiresAt,
      status: l.revokedAt ? 'REVOKED' : l.expiresAt <= now ? 'EXPIRED' : l.lockedUntil && l.lockedUntil > now ? 'LOCKED' : 'ACTIVE',
      openCount: l.openCount,
      lastOpenedAt: l.lastOpenedAt,
    }));
  }

  async revokeLink(id: string) {
    const l = await this.prisma.careConfirmLink.findFirst({ where: { id, tenantId: this.ctx.tenantId } });
    if (!l) throw new NotFoundException('链接不存在');
    await this.mother(l.motherProfileId);
    await this.prisma.careConfirmLink.update({ where: { id }, data: { revokedAt: l.revokedAt ?? new Date() } });
    return { ok: true };
  }
}
