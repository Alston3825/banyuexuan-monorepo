import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { reminderDueOn } from '../workspace/workbench.service';
import { NotificationService } from './notification.service';

const MIN = 60_000;
const DAY = 86400_000;
/** 全天提醒（没设时刻）几点推送 */
export const ALL_DAY_REMINDER_AT = '08:00';
/** 提醒时刻过了多久还补发（服务重启等错过的）；再久就不补了，免得一开机弹一堆旧提醒 */
const REMINDER_CATCHUP_MIN = 60;
/** 护理计划评审到期/待审核：每天几点后开始提醒 */
export const CARE_PLAN_CHECK_AT = '08:00';
/** 日常护理记录未填：每天几点后提醒（白天班还没填的） */
export const CARE_DAILY_CHECK_AT = '16:00';

/** 北京时间的日期和时刻（服务器/容器时区可能是 UTC，一律按北京时间算） */
export function beijingClock(now = new Date()) {
  const iso = new Date(now.getTime() + 8 * 3600_000).toISOString();
  return { date: iso.slice(0, 10), hhmm: iso.slice(11, 16) };
}
const toMin = (hhmm: string) =>
  Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const calDayUtc = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

/**
 * 定时扫描产生的站内消息：个人提醒到点、护理计划评审到期/待审核、日常护理记录未填，以及过期消息清理。
 * 每条消息带去重键（同一件事同一天只发一次），所以多实例同时跑、重启后重跑都不会重复发。
 * 各 run* 方法是公开的，测试里可以传入指定时间直接调用。
 */
@Injectable()
export class NotificationSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationSchedulerService.name);
  private timers: NodeJS.Timeout[] = [];
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  onModuleInit() {
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.NOTIFICATION_SCHEDULER === 'off'
    )
      return;
    const every = (ms: number, fn: () => Promise<unknown>, name: string) => {
      const t = setInterval(() => void this.guard(fn, name), ms);
      t.unref();
      this.timers.push(t);
    };
    every(MIN, () => this.runReminders(), '个人提醒');
    every(
      10 * MIN,
      async () => {
        await this.runCarePlan();
        await this.runCareDaily();
      },
      '护理提醒',
    );
    every(6 * 60 * MIN, () => this.notifications.purgeOld(), '清理旧消息');
    const first = setTimeout(
      () =>
        void this.guard(async () => {
          await this.runReminders();
          await this.runCarePlan();
          await this.runCareDaily();
        }, '开机扫描'),
      20_000,
    );
    first.unref();
    this.timers.push(first);
  }

  onModuleDestroy() {
    this.timers.forEach((t) => clearTimeout(t));
  }

  private async guard(fn: () => Promise<unknown>, name: string) {
    if (this.running) return;
    this.running = true;
    try {
      await fn();
    } catch (e) {
      this.logger.warn(`站内消息定时任务（${name}）失败：${e}`);
    } finally {
      this.running = false;
    }
  }

  /** 个人提醒到点：今天该出现、还没完成、时刻已到（过了不超过 1 小时）的提醒，给本人发一条。 */
  async runReminders(now = new Date()) {
    const { date, hhmm } = beijingClock(now);
    const nowMin = toMin(hhmm);
    const rows = await this.prisma.personalReminder.findMany({
      where: { active: true, startDate: { lte: date } },
      include: { completions: { where: { date }, select: { id: true } } },
    });
    let sent = 0;
    for (const r of rows) {
      if (r.completions.length > 0 || !reminderDueOn(r, date)) continue;
      const at =
        r.timeOfDay && /^\d{2}:\d{2}$/.test(r.timeOfDay)
          ? r.timeOfDay
          : ALL_DAY_REMINDER_AT;
      const diff = nowMin - toMin(at);
      if (diff < 0 || diff > REMINDER_CATCHUP_MIN) continue;
      sent += await this.notifications.notify([r.accountId], {
        tenantId: r.tenantId,
        category: 'REMINDER',
        level: 'warning',
        title: `提醒：${r.title}`,
        body: [r.timeOfDay ? `时间 ${r.timeOfDay}` : '今天全天', r.note]
          .filter(Boolean)
          .join(' · '),
        link: '/workspace/todos?tab=reminder',
        dedupKey: `reminder:${r.id}:${date}`,
      });
    }
    return sent;
  }

  /** 护理计划：评审到期（每天提醒一次，直到评审）发给主责护理师和本店护理长；新提交待审核的发给护理长（只发一次）。 */
  async runCarePlan(now = new Date()) {
    const { date, hhmm } = beijingClock(now);
    if (hhmm < CARE_PLAN_CHECK_AT) return 0;
    const today = calDayUtc(date);
    const include = {
      motherProfile: {
        select: {
          id: true,
          primaryNurseId: true,
          customer: { select: { name: true } },
          occupancy: {
            select: { status: true, room: { select: { roomNo: true } } },
          },
        },
      },
    } as const;
    const [due, pending] = await Promise.all([
      this.prisma.carePlanVersion.findMany({
        where: { status: 'ACTIVE', nextReviewDue: { lte: today } },
        include,
      }),
      this.prisma.carePlanVersion.findMany({
        where: { status: 'PENDING_REVIEW' },
        include,
      }),
    ]);
    const headsCache = new Map<string, string[]>();
    const heads = async (tenantId: string, storeId: string) => {
      const k = `${tenantId}:${storeId}`;
      if (!headsCache.has(k))
        headsCache.set(
          k,
          await this.notifications.accountsWithPermissionInStore(
            tenantId,
            'care.profile.approve',
            storeId,
          ),
        );
      return headsCache.get(k)!;
    };
    const who = (v: (typeof due)[number]) => {
      const room = v.motherProfile.occupancy?.room?.roomNo;
      return `${v.motherProfile.customer.name}${room ? `（${room}房）` : ''}${v.babyProfileId ? '宝宝' : ''}`;
    };
    let sent = 0;
    for (const v of due) {
      // 已离店的不再催评审
      if (
        v.motherProfile.occupancy &&
        v.motherProfile.occupancy.status !== 'CHECKED_IN'
      )
        continue;
      const days = Math.round(
        (today.getTime() - v.nextReviewDue!.getTime()) / DAY,
      );
      sent += await this.notifications.notify(
        [
          v.motherProfile.primaryNurseId,
          ...(await heads(v.tenantId, v.storeId)),
        ],
        {
          tenantId: v.tenantId,
          category: 'CARE_PLAN',
          level: days > 0 ? 'danger' : 'warning',
          title: `${who(v)}的护理计划${days > 0 ? `评审已超期 ${days} 天` : '今天该评审'}`,
          body: `第 ${v.versionNo} 版护理计划到了 7 天评审时间，请护理长评估上阶段结果并调整计划`,
          link: `/care/profiles/${v.motherProfile.id}?tab=plans`,
          dedupKey: `care-plan-due:${v.id}:${date}`,
        },
      );
    }
    for (const v of pending) {
      sent += await this.notifications.notify(
        await heads(v.tenantId, v.storeId),
        {
          tenantId: v.tenantId,
          category: 'CARE_PLAN',
          level: 'info',
          title: `${who(v)}的护理计划待审核`,
          body: `第 ${v.versionNo} 版护理计划已提交，等待护理主任审核生效`,
          link: `/care/profiles/${v.motherProfile.id}?tab=plans`,
          dedupKey: `care-plan-review:${v.id}`,
        },
      );
    }
    return sent;
  }

  /** 日常护理记录未填：每天下午提醒一次——主责护理师收到自己负责的，本店护理长收到全店汇总。 */
  async runCareDaily(now = new Date()) {
    const { date, hhmm } = beijingClock(now);
    if (hhmm < CARE_DAILY_CHECK_AT) return 0;
    const day = calDayUtc(date);
    const profiles = await this.prisma.motherProfile.findMany({
      where: {
        occupancy: { status: 'CHECKED_IN' },
        dailyRecords: { none: { recordDate: day } },
      },
      select: {
        id: true,
        tenantId: true,
        storeId: true,
        primaryNurseId: true,
        customer: { select: { name: true } },
        occupancy: { select: { room: { select: { roomNo: true } } } },
      },
    });
    const label = (p: (typeof profiles)[number]) =>
      `${p.occupancy?.room?.roomNo ? `${p.occupancy.room.roomNo} ` : ''}${p.customer.name}`;
    const list = (ps: typeof profiles) =>
      ps.slice(0, 12).map(label).join('、') +
      (ps.length > 12 ? ` 等 ${ps.length} 位` : '');
    let sent = 0;

    const byNurse = new Map<string, typeof profiles>();
    for (const p of profiles)
      if (p.primaryNurseId)
        byNurse.set(p.primaryNurseId, [
          ...(byNurse.get(p.primaryNurseId) ?? []),
          p,
        ]);
    for (const [nurseId, ps] of byNurse) {
      sent += await this.notifications.notify([nurseId], {
        tenantId: ps[0].tenantId,
        category: 'CARE_DAILY',
        level: 'warning',
        title: `你负责的 ${ps.length} 位妈妈今天的日常护理记录还没填`,
        body: list(ps),
        link:
          ps.length === 1
            ? `/care/profiles/${ps[0].id}?tab=daily`
            : '/care/board',
        dedupKey: `care-daily:${date}`,
      });
    }

    const byStore = new Map<string, typeof profiles>();
    for (const p of profiles)
      byStore.set(`${p.tenantId}:${p.storeId}`, [
        ...(byStore.get(`${p.tenantId}:${p.storeId}`) ?? []),
        p,
      ]);
    for (const ps of byStore.values()) {
      const heads = await this.notifications.accountsWithPermissionInStore(
        ps[0].tenantId,
        'care.profile.approve',
        ps[0].storeId,
      );
      sent += await this.notifications.notify(heads, {
        tenantId: ps[0].tenantId,
        category: 'CARE_DAILY',
        level: 'warning',
        title: `本店今天还有 ${ps.length} 位妈妈的日常护理记录没填`,
        body: list(ps),
        link: '/care/board',
        dedupKey: `care-daily-store:${ps[0].storeId}:${date}`,
      });
    }
    return sent;
  }
}
