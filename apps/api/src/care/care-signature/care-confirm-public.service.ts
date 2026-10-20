import { BadRequestException, ConflictException, ForbiddenException, GoneException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CareConfirmMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { FieldSpec, GroupSpec } from '../care-assessment/assessment-specs';
import { DAILY_BABY_FIELDS, DAILY_MOTHER_FIELDS } from '../care-daily/daily-specs';
import { LEVEL_STANDARDS } from '../care-plan-version/care-standards';
import { CONFIRM_WINDOW_DAYS, dayRecordInclude, DayRecord, hashDayRecord } from './care-signature.service';
import { assertSignatureImage, cleanDeviceId, maskName, randomToken, sha256, signToken, verifyToken } from './signature.util';

const DAY_MS = 86_400_000;
const MAX_FAILED = 5;
const LOCK_MS = 30 * 60_000;
const SESSION_MS = 60 * 60_000; // 核验通过后 1 小时内有效
const VIEW_TOKEN_MAX_MS = 30 * 60_000; // “看过内容”凭证 30 分钟内有效
const HOLD_MIN_MS = 1500; // “点击确认”必须长按 1.5 秒
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const todayYmd = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
const dayDiff = (a: string, b: string) => Math.round((new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / DAY_MS);
/** 至少要“看”这么久才允许确认：基础 6 秒 + 每多一天 2 秒（封顶 30 秒），防止一进来就连点 */
const minDwellMs = (days: number) => Math.min(30_000, 6_000 + 2_000 * days);

const HIDDEN_KEYS = new Set(['motherNurseName', 'motherClientSigner', 'dayNurseName', 'nightNurseName', 'babyClientSigner', 'nightClientSigner']);

function fmt(f: FieldSpec, v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (f.kind === 'single') return f.options?.find((o) => o.value === v)?.label ?? String(v);
  if (f.kind === 'multi') {
    const arr = Array.isArray(v) ? v : [];
    return arr.length ? arr.map((x) => f.options?.find((o) => o.value === x)?.label ?? String(x)).join('、') : null;
  }
  return f.unit ? `${v} ${f.unit}` : String(v);
}

function describeGroups(groups: GroupSpec[], values: Record<string, unknown>) {
  const out: { title: string; items: { label: string; value: string }[] }[] = [];
  for (const g of groups) {
    const items: { label: string; value: string }[] = [];
    for (const f of g.fields) {
      if (HIDDEN_KEYS.has(f.key)) continue;
      const s = fmt(f, values[f.key]);
      if (s) items.push({ label: f.label, value: s });
    }
    if (items.length === 0 && g.title.startsWith('体征')) items.push({ label: '体征', value: '无异常' });
    if (items.length) out.push({ title: g.title.replace(/（.*）/, '').replace('与签名', ''), items });
  }
  return out;
}

/** 给客户看的“当日护理记录小结”：妈妈栏 + 每个宝宝栏 + 喂养汇总（客户不需要看到护理师签字栏）。 */
function summarize(rec: DayRecord, babies: { id: string; sequenceNo: number; name: string | null }[]) {
  const num = (v: number | null | undefined) => (typeof v === 'number' ? v : null);
  return {
    mother: describeGroups(DAILY_MOTHER_FIELDS, rec as unknown as Record<string, unknown>),
    babies: babies.map((b) => {
      const br = rec.babies.find((x) => x.babyProfileId === b.id);
      if (!br) return { title: `宝宝${b.sequenceNo}${b.name ? '：' + b.name : ''}`, groups: [], feeding: null };
      const jaundice = [num(br.jaundiceForehead), num(br.jaundiceCanthus), num(br.jaundiceChest)].filter((x): x is number => x !== null);
      const groups = describeGroups(DAILY_BABY_FIELDS, br as unknown as Record<string, unknown>);
      if (jaundice.length) groups.push({ title: '黄疸', items: [{ label: '黄疸平均值', value: String(Math.round((jaundice.reduce((a, c) => a + c, 0) / jaundice.length) * 10) / 10) }] });
      const sum = (k: 'formulaMl' | 'breastMilkMl') => br.feedings.reduce((a, f) => a + (f[k] ?? 0), 0);
      return {
        title: `宝宝${b.sequenceNo}${b.name ? '：' + b.name : ''}`,
        groups,
        feeding: { 奶粉合计: `${sum('formulaMl')} ml`, 母乳合计: `${sum('breastMilkMl')} ml`, 小便: `${br.feedings.filter((f) => f.urine === 'YES').length} 次`, 大便: `${br.feedings.filter((f) => f.stool === 'YES').length} 次` },
      };
    }),
  };
}

/**
 * 客户通过链接确认日常护理记录（不用登录）。怎么确定是客户本人：
 *  ① 链接只发给客户，随机 64 位、7 天有效、只存哈希，护理师重新生成后旧链接立即作废；
 *  ② 打开后必须输入客户档案里登记的手机号后四位（错 5 次锁 30 分钟）；
 *  ③ 确认前必须“看够时间”（服务器计时，基础 6 秒 + 每多一天 2 秒），确认内容与看到的内容必须一致（期间被改动要重新看）；
 *  ④ “点击确认”要长按 1.5 秒；也可以手写签名（证据更强）；
 *  ⑤ 留下 IP、浏览器、设备号、时长、内容指纹；设备号和护理师登录过的设备相同 → 打风险标记，且这种设备上不接受“点击确认”，只接受手写签名。
 */
@Injectable()
export class CareConfirmPublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private get secret() {
    return `${this.config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-secret'}:care-confirm`;
  }

  private async linkByToken(token: string) {
    const link = await this.prisma.careConfirmLink.findUnique({
      where: { tokenHash: sha256(String(token ?? '')) },
      include: { motherProfile: { include: { customer: { select: { name: true, phone: true } }, babies: { orderBy: { sequenceNo: 'asc' } }, occupancy: { select: { room: { select: { roomNo: true } } } }, store: { select: { name: true } } } } },
    });
    if (!link) throw new NotFoundException('链接无效，请联系护理师重新发送');
    if (link.revokedAt) throw new GoneException('这个链接已作废，请向护理师要最新的链接');
    if (link.expiresAt <= new Date()) throw new GoneException('这个链接已过期（7 天有效），请向护理师要新链接');
    return link;
  }

  /** 打开链接先看到的内容：只有打码的姓名，不含任何记录内容。 */
  async info(token: string) {
    const link = await this.linkByToken(token);
    const now = new Date();
    return {
      customerName: maskName(link.motherProfile.customer.name),
      storeName: link.motherProfile.store.name,
      expiresAt: link.expiresAt,
      locked: !!(link.lockedUntil && link.lockedUntil > now),
      lockedUntil: link.lockedUntil && link.lockedUntil > now ? link.lockedUntil : null,
    };
  }

  /** 核验本人：手机号后四位。 */
  async verify(token: string, phoneLast4: string) {
    const link = await this.linkByToken(token);
    const now = new Date();
    if (link.lockedUntil && link.lockedUntil > now) throw new ForbiddenException(`尝试次数过多，已暂时锁定，请 ${Math.ceil((link.lockedUntil.getTime() - now.getTime()) / 60000)} 分钟后再试`);
    const digits = (link.motherProfile.customer.phone ?? '').replace(/\D/g, '');
    if (digits.length < 4) throw new ConflictException('登记的手机号不完整，无法核验，请联系护理师');
    if (!/^\d{4}$/.test(String(phoneLast4 ?? '')) || digits.slice(-4) !== phoneLast4) {
      const failed = link.failedAttempts + 1;
      const lock = failed >= MAX_FAILED;
      await this.prisma.careConfirmLink.update({ where: { id: link.id }, data: { failedAttempts: lock ? 0 : failed, lockedUntil: lock ? new Date(now.getTime() + LOCK_MS) : link.lockedUntil } });
      throw new UnauthorizedException(lock ? '手机号后四位不对，已连续错误 5 次，链接锁定 30 分钟' : `手机号后四位不对，还可以再试 ${MAX_FAILED - failed} 次`);
    }
    await this.prisma.careConfirmLink.update({ where: { id: link.id }, data: { failedAttempts: 0, lockedUntil: null, openCount: { increment: 1 }, lastOpenedAt: now } });
    return { session: signToken({ lid: link.id, exp: now.getTime() + SESSION_MS }, this.secret) };
  }

  private async sessionLink(token: string, session: string | undefined) {
    const link = await this.linkByToken(token);
    const s = verifyToken<{ lid: string; exp: number }>(session, this.secret);
    if (!s || s.lid !== link.id || s.exp < Date.now()) throw new UnauthorizedException('验证已过期，请重新输入手机号后四位');
    return link;
  }

  private async recordsInWindow(motherProfileId: string) {
    const today = todayYmd();
    const from = new Date(`${today}T00:00:00.000Z`);
    from.setUTCDate(from.getUTCDate() - CONFIRM_WINDOW_DAYS);
    const records = await this.prisma.careDailyRecord.findMany({
      where: { motherProfileId, recordDate: { gte: from } },
      include: { ...dayRecordInclude, signatures: { orderBy: { signedAt: 'asc' } }, confirmations: { orderBy: { confirmedAt: 'desc' }, take: 1 } },
      orderBy: { recordDate: 'desc' },
    });
    return records;
  }

  /** 最近 7 天内已有记录的日子：小结 + 值班护理师 + 是否已确认。 */
  async days(token: string, session: string | undefined) {
    const link = await this.sessionLink(token, session);
    const m = link.motherProfile;
    const records = await this.recordsInWindow(m.id);
    const hashes: Record<string, string> = {};
    // 当天完成的服务项目（洗澡、查房、中药泡脚…），让客户看到“服务内容已按要求完成”
    const names = new Map(LEVEL_STANDARDS.LEVEL3.services.map((s) => [s.code, s.name]));
    const babyLabel = new Map(m.babies.map((b) => [b.id, `宝宝${b.sequenceNo}${b.name ? '：' + b.name : ''}`]));
    const logs = await this.prisma.careServiceLog.findMany({ where: { motherProfileId: m.id, doneDate: { gte: records.length ? records[records.length - 1].recordDate : new Date() } }, orderBy: [{ doneDate: 'asc' }, { doneTime: 'asc' }] });
    const days = records.map((r) => {
      const date = ymd(r.recordDate);
      const hash = hashDayRecord(r);
      hashes[date] = hash.slice(0, 16);
      const conf = r.confirmations[0];
      return {
        date,
        stayDay: r.stayDay,
        summary: summarize(r, m.babies),
        nurses: r.signatures.map((s) => ({ signatureId: s.id, name: s.nurseName, shift: s.shift })),
        services: logs
          .filter((l) => ymd(l.doneDate) === date)
          .map((l) => ({ name: names.get(l.serviceCode) ?? l.serviceCode, time: l.doneTime, baby: l.babyProfileId ? (babyLabel.get(l.babyProfileId) ?? null) : null, by: l.doneByName })),
        status: !conf ? 'NONE' : conf.contentHash === hash ? 'CONFIRMED' : 'STALE', // STALE = 确认后护理师又改过，需要重新确认
        confirmedAt: conf?.confirmedAt ?? null,
        satisfaction: conf?.satisfaction ?? null,
        nurseRatings: (conf?.nurseRatings as unknown) ?? null,
      };
    });
    const viewToken = signToken({ lid: link.id, iat: Date.now(), h: hashes }, this.secret);
    return {
      customerName: maskName(m.customer.name),
      storeName: m.store.name,
      roomNo: m.occupancy?.room?.roomNo ?? null,
      windowDays: CONFIRM_WINDOW_DAYS,
      holdMinMs: HOLD_MIN_MS,
      minViewMs: minDwellMs(1),
      days,
      viewToken,
    };
  }

  async confirm(
    token: string,
    session: string | undefined,
    body: {
      viewToken: string;
      items: { date: string; satisfaction: number; comment?: string; nurseRatings?: { signatureId: string; score: number }[] }[];
      method: CareConfirmMethod;
      signatureData?: string;
      holdMs?: number;
      deviceId?: string;
      acknowledged?: boolean;
    },
    meta: { ip?: string; userAgent?: string },
  ) {
    const link = await this.sessionLink(token, session);
    const m = link.motherProfile;
    if (!body.acknowledged) throw new BadRequestException('请先勾选“我已阅读以上护理记录小结”');
    const view = verifyToken<{ lid: string; iat: number; h: Record<string, string> }>(body.viewToken, this.secret);
    if (!view || view.lid !== link.id) throw new BadRequestException('页面已过期，请刷新后重新查看');
    const age = Date.now() - view.iat;
    if (age > VIEW_TOKEN_MAX_MS) throw new BadRequestException('页面停留太久，请刷新页面重新查看后再确认');
    if (!Array.isArray(body.items) || body.items.length === 0) throw new BadRequestException('请选择要确认的日期');
    if (body.items.length > CONFIRM_WINDOW_DAYS + 1) throw new BadRequestException('一次最多确认 8 天');
    const need = minDwellMs(body.items.length);
    if (age < need) throw new BadRequestException(`请先仔细阅读记录内容（至少需要 ${Math.ceil(need / 1000)} 秒），再进行确认`);
    if (body.method !== 'SIGNATURE' && body.method !== 'BUTTON') throw new BadRequestException('请选择确认方式');

    const deviceId = cleanDeviceId(body.deviceId);
    if (!deviceId) throw new BadRequestException('无法识别您的设备，请刷新页面重试');
    const staffDevice = (await this.prisma.staffDevice.count({ where: { deviceId } })) > 0;
    let signature: string | null = null;
    let holdMs: number | null = null;
    if (body.method === 'SIGNATURE') {
      signature = assertSignatureImage(body.signatureData);
    } else {
      holdMs = Number.isFinite(body.holdMs) ? Math.min(Math.max(Math.round(body.holdMs!), 0), 60_000) : 0;
      if (holdMs < HOLD_MIN_MS) throw new BadRequestException('请按住“确认”按钮不放，直到进度走满');
      if (staffDevice) throw new ForbiddenException('请使用您本人的手机打开链接确认；如果就在护理师的设备上，请改用手写签名确认');
    }

    const dates = body.items.map((i) => i.date);
    if (new Set(dates).size !== dates.length) throw new BadRequestException('日期重复');
    const records = await this.recordsInWindow(m.id);
    const byDate = new Map(records.map((r) => [ymd(r.recordDate), r]));
    const toCreate: { rec: (typeof records)[number]; hash: string; satisfaction: number; comment: string | null; nurseRatings: Prisma.InputJsonValue | undefined }[] = [];
    for (const it of body.items) {
      const rec = byDate.get(it.date);
      if (!rec) throw new BadRequestException(`${it.date} 的记录不在可确认范围内（只能确认最近 ${CONFIRM_WINDOW_DAYS} 天、已有记录的日子）`);
      if (!Number.isInteger(it.satisfaction) || it.satisfaction < 1 || it.satisfaction > 5) throw new BadRequestException(`请给 ${it.date} 选择满意度（1~5 星）`);
      const hash = hashDayRecord(rec);
      if (view.h[it.date] !== hash.slice(0, 16)) throw new ConflictException(`${it.date} 的记录刚刚有更新，请刷新页面重新查看后再确认`);
      const prev = rec.confirmations[0];
      if (prev && prev.contentHash === hash) throw new ConflictException(`${it.date} 已经确认过了`);
      // 对当班护理师的评价：只能评这一天签过字的护理师，每人 1~5 星
      const ratings = (it.nurseRatings ?? []).map((r) => {
        const sig = rec.signatures.find((s) => s.id === r.signatureId);
        if (!sig) throw new BadRequestException(`${it.date} 的评价对象不是这天的值班护理师`);
        if (!Number.isInteger(r.score) || r.score < 1 || r.score > 5) throw new BadRequestException(`请给 ${sig.nurseName} 选择 1~5 星`);
        return { signatureId: sig.id, nurseAccountId: sig.nurseAccountId, nurseName: sig.nurseName, shift: sig.shift, score: r.score };
      });
      toCreate.push({ rec, hash, satisfaction: it.satisfaction, comment: it.comment?.trim().slice(0, 500) || null, nurseRatings: ratings.length ? (ratings as Prisma.InputJsonValue) : undefined });
    }

    // 风险标记：设备号和护理师用过的设备相同；同一台设备在 30 天内替 3 个以上不同客户确认过
    const flags: string[] = [];
    if (staffDevice) flags.push('STAFF_DEVICE');
    const since = new Date(Date.now() - 30 * DAY_MS);
    const others = await this.prisma.careDailyConfirmation.findMany({ where: { deviceId, confirmedAt: { gte: since }, dailyRecord: { motherProfileId: { not: m.id } } }, select: { dailyRecord: { select: { motherProfileId: true } } } });
    if (new Set(others.map((o) => o.dailyRecord.motherProfileId)).size >= 2) flags.push('MULTI_CUSTOMER_DEVICE');

    const batchId = randomToken(10);
    await this.prisma.careDailyConfirmation.createMany({
      data: toCreate.map((c) => ({
        tenantId: link.tenantId,
        storeId: link.storeId,
        dailyRecordId: c.rec.id,
        linkId: link.id,
        batchId,
        method: body.method,
        signatureData: signature,
        satisfaction: c.satisfaction,
        nurseRatings: c.nurseRatings,
        comment: c.comment,
        contentHash: c.hash,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
        deviceId,
        dwellMs: age,
        holdMs,
        riskFlags: flags.length ? (flags as Prisma.InputJsonValue) : undefined,
      })),
    });
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'CareDailyConfirmation',
      entityId: batchId,
      afterData: { dates, method: body.method, flags, dwellMs: age } as Prisma.InputJsonValue,
      remark: `客户确认日常护理记录 ${dates.join('、')}（${body.method === 'SIGNATURE' ? '手写签名' : '点击确认'}）`,
      tenantId: link.tenantId,
      storeId: link.storeId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return { confirmed: dates, batchId };
  }
}
