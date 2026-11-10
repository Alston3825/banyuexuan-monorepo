import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContextService } from '../common/context/request-context.service';

const QUADRANTS = ['Q1', 'Q2', 'Q3', 'Q4'];
const REPEATS = ['NONE', 'DAILY', 'WEEKDAYS', 'WEEKLY', 'MONTHLY'];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const isYmd = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const parseYmd = (s: string) => new Date(`${s}T00:00:00`);

interface ReminderRow {
  repeat: string;
  startDate: string;
  weekday: number | null;
  monthDay: number | null;
}
/** 某条提醒在 date 这天是否该出现 */
export function reminderDueOn(r: ReminderRow, date: string): boolean {
  if (date < r.startDate) return false;
  const d = parseYmd(date);
  const start = parseYmd(r.startDate);
  switch (r.repeat) {
    case 'NONE':
      return date === r.startDate;
    case 'DAILY':
      return true;
    case 'WEEKDAYS':
      return d.getDay() >= 1 && d.getDay() <= 5;
    case 'WEEKLY':
      return d.getDay() === (r.weekday ?? start.getDay());
    case 'MONTHLY': {
      const want = r.monthDay ?? start.getDate();
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      return d.getDate() === Math.min(want, last);
    }
    default:
      return false;
  }
}

/** 我的待办·个人工作台：四象限任务 / 重要提醒 / 正在进行中 / 快捷入口。数据都只属于当前登录人。 */
@Injectable()
export class WorkbenchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContextService,
  ) {}
  private get me() {
    return { tenantId: this.ctx.tenantId!, accountId: this.ctx.accountId! };
  }
  private clean(s: unknown, max: number, required = false): string | null {
    const v = typeof s === 'string' ? s.trim() : '';
    if (!v && required) throw new BadRequestException('内容不能为空');
    return v ? v.slice(0, max) : null;
  }

  // ---------- 四象限 ----------
  async tasks() {
    // 未完成的一直显示；已完成的只保留当天（划线显示），隔天自动消失
    return this.prisma.personalTask.findMany({
      where: { ...this.me, OR: [{ done: false }, { doneAt: { gte: startOfToday() } }] },
      orderBy: [{ done: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }
  async createTask(dto: { title?: string; note?: string; quadrant?: string }) {
    const quadrant = QUADRANTS.includes(dto.quadrant ?? '') ? (dto.quadrant as 'Q1') : 'Q2';
    const max = await this.prisma.personalTask.aggregate({ where: { ...this.me, quadrant }, _max: { sortOrder: true } });
    return this.prisma.personalTask.create({ data: { ...this.me, title: this.clean(dto.title, 200, true)!, note: this.clean(dto.note, 500), quadrant, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
  }
  async updateTask(id: string, dto: { title?: string; note?: string; quadrant?: string; done?: boolean }) {
    const row = await this.prisma.personalTask.findFirst({ where: { id, ...this.me } });
    if (!row) throw new NotFoundException('任务不存在');
    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) data.title = this.clean(dto.title, 200, true);
    if (dto.note !== undefined) data.note = this.clean(dto.note, 500);
    if (dto.quadrant !== undefined) {
      if (!QUADRANTS.includes(dto.quadrant)) throw new BadRequestException('象限不正确');
      if (dto.quadrant !== row.quadrant) {
        const max = await this.prisma.personalTask.aggregate({ where: { ...this.me, quadrant: dto.quadrant as 'Q1' }, _max: { sortOrder: true } });
        data.quadrant = dto.quadrant;
        data.sortOrder = (max._max.sortOrder ?? 0) + 1;
      }
    }
    if (dto.done !== undefined) {
      data.done = !!dto.done;
      data.doneAt = dto.done ? new Date() : null;
    }
    return this.prisma.personalTask.update({ where: { id }, data });
  }
  async deleteTask(id: string) {
    await this.prisma.personalTask.deleteMany({ where: { id, ...this.me } });
    return { ok: true };
  }

  // ---------- 重要提醒 ----------
  /** 某一天要出现的提醒（含：以前一次性提醒没完成的“逾期”，最多回看 7 天） */
  async remindersForDay(date?: string) {
    const day = isYmd(date) ? date : ymd(new Date());
    const rows = await this.prisma.personalReminder.findMany({ where: { ...this.me, active: true }, include: { completions: true } });
    const weekAgo = ymd(new Date(parseYmd(day).getTime() - 7 * 86400_000));
    const out = rows
      .map((r) => {
        const due = reminderDueOn(r, day);
        const overdue = !due && r.repeat === 'NONE' && r.startDate < day && r.startDate >= weekAgo && r.completions.length === 0;
        if (!due && !overdue) return null;
        const done = r.completions.some((c) => c.date === (overdue ? r.startDate : day));
        return { id: r.id, title: r.title, note: r.note, timeOfDay: r.timeOfDay, repeat: r.repeat, startDate: r.startDate, overdue, done, date: overdue ? r.startDate : day };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
    out.sort((a, b) => Number(a.done) - Number(b.done) || Number(b.overdue) - Number(a.overdue) || (a.timeOfDay ?? '99:99').localeCompare(b.timeOfDay ?? '99:99'));
    return out;
  }
  /** 管理用：我设置过的全部提醒 */
  async reminderDefs() {
    return this.prisma.personalReminder.findMany({ where: { ...this.me, active: true }, orderBy: [{ createdAt: 'desc' }] });
  }
  private reminderData(dto: { title?: string; note?: string; repeat?: string; startDate?: string; timeOfDay?: string | null; weekday?: number | null; monthDay?: number | null }, partial = false) {
    const data: Record<string, unknown> = {};
    if (!partial || dto.title !== undefined) data.title = this.clean(dto.title, 200, true);
    if (dto.note !== undefined) data.note = this.clean(dto.note, 500);
    if (!partial || dto.repeat !== undefined) {
      if (!REPEATS.includes(dto.repeat ?? 'NONE')) throw new BadRequestException('重复方式不正确');
      data.repeat = dto.repeat ?? 'NONE';
    }
    if (!partial || dto.startDate !== undefined) {
      if (!isYmd(dto.startDate)) throw new BadRequestException('请选择日期');
      data.startDate = dto.startDate;
    }
    if (dto.timeOfDay !== undefined) {
      if (dto.timeOfDay && !/^([01]\d|2[0-3]):[0-5]\d$/.test(dto.timeOfDay)) throw new BadRequestException('时间格式应为 HH:mm');
      data.timeOfDay = dto.timeOfDay || null;
    }
    if (dto.weekday !== undefined) data.weekday = dto.weekday === null ? null : Math.min(6, Math.max(0, Number(dto.weekday)));
    if (dto.monthDay !== undefined) data.monthDay = dto.monthDay === null ? null : Math.min(31, Math.max(1, Number(dto.monthDay)));
    return data;
  }
  async createReminder(dto: Parameters<WorkbenchService['reminderData']>[0]) {
    return this.prisma.personalReminder.create({ data: { ...this.me, ...(this.reminderData(dto) as any) } });
  }
  async updateReminder(id: string, dto: Parameters<WorkbenchService['reminderData']>[0]) {
    const row = await this.prisma.personalReminder.findFirst({ where: { id, ...this.me } });
    if (!row) throw new NotFoundException('提醒不存在');
    return this.prisma.personalReminder.update({ where: { id }, data: this.reminderData(dto, true) as any });
  }
  async deleteReminder(id: string) {
    await this.prisma.personalReminder.deleteMany({ where: { id, ...this.me } });
    return { ok: true };
  }
  async markReminder(id: string, dto: { date?: string; done?: boolean }) {
    const row = await this.prisma.personalReminder.findFirst({ where: { id, ...this.me } });
    if (!row) throw new NotFoundException('提醒不存在');
    const date = isYmd(dto.date) ? dto.date : ymd(new Date());
    if (dto.done === false) await this.prisma.personalReminderDone.deleteMany({ where: { reminderId: id, date } });
    else await this.prisma.personalReminderDone.upsert({ where: { reminderId_date: { reminderId: id, date } }, create: { reminderId: id, date }, update: {} });
    return { ok: true };
  }
  /** 今天还没完成的提醒数（给红点用） */
  async reminderBadge() {
    return (await this.remindersForDay()).filter((r) => !r.done).length;
  }

  // ---------- 正在进行中 ----------
  async ongoing() {
    return this.prisma.ongoingWork.findMany({
      where: { ...this.me, OR: [{ finished: false }, { finishedAt: { gte: new Date(Date.now() - 7 * 86400_000) } }] },
      include: { steps: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
      orderBy: [{ finished: 'asc' }, { createdAt: 'desc' }],
    });
  }
  async createOngoing(dto: { title?: string; note?: string; steps?: string[] }) {
    const steps = (Array.isArray(dto.steps) ? dto.steps : []).map((s) => this.clean(s, 200)).filter((s): s is string => !!s);
    return this.prisma.ongoingWork.create({
      data: { ...this.me, title: this.clean(dto.title, 200, true)!, note: this.clean(dto.note, 500), steps: { create: steps.map((title, i) => ({ title, sortOrder: i + 1 })) } },
      include: { steps: true },
    });
  }
  private async ownWork(id: string) {
    const w = await this.prisma.ongoingWork.findFirst({ where: { id, ...this.me } });
    if (!w) throw new NotFoundException('事项不存在');
    return w;
  }
  async updateOngoing(id: string, dto: { title?: string; note?: string; finished?: boolean }) {
    await this.ownWork(id);
    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) data.title = this.clean(dto.title, 200, true);
    if (dto.note !== undefined) data.note = this.clean(dto.note, 500);
    if (dto.finished !== undefined) {
      data.finished = !!dto.finished;
      data.finishedAt = dto.finished ? new Date() : null;
    }
    return this.prisma.ongoingWork.update({ where: { id }, data });
  }
  async deleteOngoing(id: string) {
    await this.prisma.ongoingWork.deleteMany({ where: { id, ...this.me } });
    return { ok: true };
  }
  async addStep(id: string, dto: { title?: string }) {
    await this.ownWork(id);
    const max = await this.prisma.ongoingWorkStep.aggregate({ where: { workId: id }, _max: { sortOrder: true } });
    return this.prisma.ongoingWorkStep.create({ data: { workId: id, title: this.clean(dto.title, 200, true)!, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
  }
  async updateStep(id: string, stepId: string, dto: { title?: string; result?: string; done?: boolean }) {
    await this.ownWork(id);
    const step = await this.prisma.ongoingWorkStep.findFirst({ where: { id: stepId, workId: id } });
    if (!step) throw new NotFoundException('节点不存在');
    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) data.title = this.clean(dto.title, 200, true);
    if (dto.result !== undefined) data.result = this.clean(dto.result, 500);
    if (dto.done !== undefined) {
      data.done = !!dto.done;
      data.doneAt = dto.done ? new Date() : null;
    }
    return this.prisma.ongoingWorkStep.update({ where: { id: stepId }, data });
  }
  async deleteStep(id: string, stepId: string) {
    await this.ownWork(id);
    await this.prisma.ongoingWorkStep.deleteMany({ where: { id: stepId, workId: id } });
    return { ok: true };
  }

  // ---------- 快捷入口 ----------
  async links() {
    return this.prisma.quickLink.findMany({ where: this.me, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  }
  /** 整体保存（前端勾选 + 排序后一次提交） */
  async saveLinks(dto: { links?: { path: string; label: string }[] }) {
    const list = (Array.isArray(dto.links) ? dto.links : []).filter((l) => typeof l?.path === 'string' && l.path.startsWith('/') && l.path.length <= 200 && typeof l.label === 'string' && l.label.trim());
    const seen = new Set<string>();
    const uniq = list.filter((l) => (seen.has(l.path) ? false : (seen.add(l.path), true))).slice(0, 24);
    await this.prisma.$transaction([
      this.prisma.quickLink.deleteMany({ where: this.me }),
      this.prisma.quickLink.createMany({ data: uniq.map((l, i) => ({ ...this.me, path: l.path, label: l.label.trim().slice(0, 60), sortOrder: i })) }),
    ]);
    return this.links();
  }
}
