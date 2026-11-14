import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { RequestContextService } from '../common/context/request-context.service';
import { AiGatewayClient } from '../ai/ai-gateway/ai-gateway.client';
import { CareStorageService } from '../care/care-document/care-storage.service';
import { SatisfactionExtractionService } from './satisfaction-extraction.service';
import { formItems, SATISFIED_MIN, SCORE_MAX, UNSATISFIED_MAX } from './survey-specs';
import { ensureDefaultTemplates, toSpec } from './satisfaction-template.service';

const filesSelect = { orderBy: { sortOrder: 'asc' as const }, select: { id: true, fileName: true, mimeType: true, sizeBytes: true, sortOrder: true } };
const isHeic = (f: Express.Multer.File) => /^image\/hei[cf]$/i.test(f.mimetype) || /\.hei[cf]$/i.test(f.originalname);
const isPdf = (f: Express.Multer.File) => f.buffer.subarray(0, 4).toString() === '%PDF';
const dayStr = (d: Date) => d.toISOString().slice(0, 10);

export interface SurveyFilter {
  templateId?: string;
  from?: string;
  to?: string;
  storeId?: string;
  steward?: string;
}
export interface SurveyPatch {
  customerId?: string | null;
  customerName?: string | null;
  roomNo?: string | null;
  stewardName?: string | null;
  nurseName?: string | null;
  phone?: string | null;
  surveyDate?: string | null;
  scores?: Record<string, number | null>;
  suggestion?: string | null;
  praise?: string | null;
}

@Injectable()
export class SatisfactionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: CareStorageService,
    private readonly extraction: SatisfactionExtractionService,
    private readonly aiGateway: AiGatewayClient,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  /** 模板（含停用的，历史记录要用）；没有模板时先生成内置三张 */
  async specs() {
    await ensureDefaultTemplates(this.prisma, this.ctx.tenantId!, this.ctx.accountId!);
    const rows = await this.prisma.satisfactionTemplate.findMany({ where: { tenantId: this.ctx.tenantId! }, orderBy: [{ sortNo: 'asc' }, { createdAt: 'asc' }] });
    return { templates: rows.map((t) => ({ ...toSpec(t), status: t.status })), scoreMax: SCORE_MAX, satisfiedMin: SATISFIED_MIN, unsatisfiedMax: UNSATISFIED_MAX };
  }

  private async templateOf(templateId: string | null) {
    const t = templateId ? await this.prisma.satisfactionTemplate.findFirst({ where: { id: templateId, tenantId: this.ctx.tenantId! } }) : null;
    if (!t) throw new NotFoundException('这份调查对应的模板不存在');
    return t;
  }

  private where(f: SurveyFilter & { status?: string; keyword?: string }): Prisma.SatisfactionSurveyWhereInput {
    const dateWhere: Prisma.DateTimeNullableFilter = {};
    if (f.from) dateWhere.gte = new Date(`${f.from}T00:00:00.000Z`);
    if (f.to) dateWhere.lte = new Date(`${f.to}T00:00:00.000Z`);
    const k = f.keyword?.trim();
    return {
      tenantId: this.ctx.tenantId!,
      templateId: f.templateId || undefined,
      status: f.status || undefined,
      storeId: f.storeId || undefined,
      stewardName: f.steward || undefined,
      ...(f.from || f.to ? { surveyDate: dateWhere } : {}),
      ...(k ? { OR: [{ customerName: { contains: k } }, { roomNo: { contains: k } }, { stewardName: { contains: k } }, { nurseName: { contains: k } }, { suggestion: { contains: k } }, { praise: { contains: k } }] } : {}),
    };
  }

  async list(q: SurveyFilter & { status?: string; keyword?: string }) {
    const rows = await this.prisma.satisfactionSurvey.findMany({
      where: this.where(q),
      include: { files: filesSelect },
      orderBy: [{ createdAt: 'desc' }],
      take: 500,
    });
    const ids = [...new Set(rows.map((r) => r.customerId).filter((x): x is string => !!x))];
    const customers = ids.length ? await this.prisma.customer.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, phone: true } }) : [];
    const byId = new Map(customers.map((c) => [c.id, c]));
    return rows.map((r) => ({ ...r, customer: r.customerId ? byId.get(r.customerId) ?? null : null }));
  }

  async getOne(id: string) {
    const row = await this.prisma.satisfactionSurvey.findFirst({ where: { id, tenantId: this.ctx.tenantId! }, include: { files: filesSelect } });
    if (!row) throw new NotFoundException('调查记录不存在');
    const customer = row.customerId ? await this.prisma.customer.findUnique({ where: { id: row.customerId }, select: { id: true, name: true, phone: true } }) : null;
    return { ...row, customer };
  }

  /** 上传一份纸质调查表（可含多张照片）：自动识别；不传照片也能建（手工录入）。 */
  async create(files: Express.Multer.File[], dto: { templateId: string; customerId?: string }) {
    await ensureDefaultTemplates(this.prisma, this.ctx.tenantId!, this.ctx.accountId!);
    const tpl = await this.prisma.satisfactionTemplate.findFirst({ where: { id: dto.templateId, tenantId: this.ctx.tenantId! } });
    if (!tpl) throw new BadRequestException('请选择调查表模板');
    if (tpl.status !== 'ACTIVE') throw new BadRequestException('这个模板已停用，请选择启用中的模板');
    for (const f of files ?? []) {
      if (!isPdf(f) && !/^image\/(jpeg|png|webp|hei[cf])$/i.test(f.mimetype) && !isHeic(f)) {
        throw new BadRequestException(`文件「${this.fileName(f)}」不是照片（JPG/PNG/HEIC）或 PDF`);
      }
    }
    let storeId: string | null = this.ctx.homeStoreId ?? null;
    if (dto.customerId) {
      const c = await this.prisma.customer.findFirst({ where: { id: dto.customerId, tenantId: this.ctx.tenantId! }, select: { primaryStoreId: true } });
      if (!c) throw new NotFoundException('客户不存在');
      storeId = c.primaryStoreId ?? storeId;
    }
    const created = await this.prisma.satisfactionSurvey.create({
      data: {
        tenantId: this.ctx.tenantId!,
        storeId,
        formNo: tpl.sortNo,
        templateId: tpl.id,
        customerId: dto.customerId ?? null,
        scores: {},
        extractStatus: files?.length ? 'PENDING' : 'NONE',
        createdBy: this.ctx.accountId!,
      },
    });
    if (files?.length) {
      await this.saveFiles(created.id, files, 0);
      this.extraction.enqueue(created.id);
    }
    await this.audit('CREATE', created.id, { template: tpl.name, files: files?.length ?? 0 });
    return this.getOne(created.id);
  }

  async addFiles(id: string, files: Express.Multer.File[]) {
    if (!files?.length) throw new BadRequestException('请选择照片或 PDF 文件');
    const row = await this.getOne(id);
    await this.saveFiles(id, files, row.files.length);
    return this.getOne(id);
  }

  async update(id: string, patch: SurveyPatch) {
    const row = await this.getOne(id);
    const spec = toSpec(await this.templateOf(row.templateId));
    const data: Prisma.SatisfactionSurveyUpdateInput = { version: { increment: 1 } };
    const str = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null);
    if (patch.customerName !== undefined) data.customerName = str(patch.customerName);
    if (patch.roomNo !== undefined) data.roomNo = str(patch.roomNo);
    if (patch.stewardName !== undefined) data.stewardName = str(patch.stewardName);
    if (patch.nurseName !== undefined) data.nurseName = str(patch.nurseName);
    if (patch.phone !== undefined) data.phone = str(patch.phone);
    if (patch.suggestion !== undefined) data.suggestion = str(patch.suggestion);
    if (patch.praise !== undefined) data.praise = str(patch.praise);
    if (patch.surveyDate !== undefined) data.surveyDate = patch.surveyDate ? new Date(`${patch.surveyDate.slice(0, 10)}T00:00:00.000Z`) : null;
    if (patch.customerId !== undefined) {
      if (patch.customerId) {
        const c = await this.prisma.customer.findFirst({ where: { id: patch.customerId, tenantId: this.ctx.tenantId! }, select: { name: true, primaryStoreId: true } });
        if (!c) throw new NotFoundException('客户不存在');
        data.customerId = patch.customerId;
        if (!row.storeId && c.primaryStoreId) data.storeId = c.primaryStoreId;
      } else {
        data.customerId = null;
      }
    }
    if (patch.scores) {
      const valid = new Set(formItems(spec).map((i) => i.key));
      const next: Record<string, number> = { ...((row.scores as Record<string, number> | null) ?? {}) };
      for (const [k, v] of Object.entries(patch.scores)) {
        if (!valid.has(k)) continue;
        if (v === null || v === undefined) delete next[k];
        else if (Number.isInteger(v) && v >= 0 && v <= SCORE_MAX) next[k] = v;
        else throw new BadRequestException(`分值必须是 0~${SCORE_MAX} 的整数`);
      }
      data.scores = next as Prisma.InputJsonValue;
    }
    await this.prisma.satisfactionSurvey.update({ where: { id }, data });
    await this.audit('UPDATE', id, { fields: Object.keys(patch) });
    return this.getOne(id);
  }

  /** 核对无误后确认：确认后才计入统计。可以撤回再改。 */
  async confirm(id: string) {
    const row = await this.getOne(id);
    const scores = (row.scores as Record<string, number> | null) ?? {};
    if (Object.keys(scores).length === 0 && !row.suggestion && !row.praise) throw new BadRequestException('还没有任何评分或意见，不能确认');
    if (!row.customerName && !row.customerId) throw new BadRequestException('请先填写或选择客户');
    await this.prisma.satisfactionSurvey.update({ where: { id }, data: { status: 'CONFIRMED', confirmedBy: this.ctx.accountId, confirmedAt: new Date(), version: { increment: 1 } } });
    await this.audit('UPDATE', id, { status: 'CONFIRMED' });
    return this.getOne(id);
  }

  async unconfirm(id: string) {
    await this.getOne(id);
    await this.prisma.satisfactionSurvey.update({ where: { id }, data: { status: 'DRAFT', confirmedBy: null, confirmedAt: null, version: { increment: 1 } } });
    return this.getOne(id);
  }

  async reextract(id: string) {
    const row = await this.getOne(id);
    if (row.files.length === 0) throw new BadRequestException('还没有上传照片');
    if (row.extractStatus === 'PENDING' || row.extractStatus === 'RUNNING') throw new ConflictException('正在识别中，请稍候');
    await this.prisma.satisfactionSurvey.update({ where: { id }, data: { extractStatus: 'PENDING', extractError: null } });
    this.extraction.enqueue(id);
    return this.getOne(id);
  }

  async remove(id: string) {
    const row = await this.getOne(id);
    await this.prisma.satisfactionSurvey.delete({ where: { id } });
    await this.storage.removeDocumentDir(`satisfaction-${id}`);
    await this.audit('DELETE', id, { formNo: row.formNo, customerName: row.customerName });
  }

  async openFile(id: string, fileId: string) {
    const file = await this.prisma.satisfactionSurveyFile.findFirst({ where: { id: fileId, surveyId: id, tenantId: this.ctx.tenantId! } });
    if (!file) throw new NotFoundException('文件不存在');
    const { stream, size } = await this.storage.readStream(file.storagePath);
    return { stream, size, mimeType: file.mimeType, fileName: file.fileName };
  }

  // ---------------- 统计分析（只统计已确认的） ----------------

  async stats(f: SurveyFilter) {
    const rows = await this.prisma.satisfactionSurvey.findMany({ where: this.where({ ...f, status: 'CONFIRMED' }), orderBy: { surveyDate: 'asc' } });
    const level = (v: number) => (v >= SATISFIED_MIN ? 'good' : v <= UNSATISFIED_MAX ? 'bad' : 'mid');
    const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);
    const tpls = (await this.prisma.satisfactionTemplate.findMany({ where: { tenantId: this.ctx.tenantId!, ...(f.templateId ? { id: f.templateId } : {}) }, orderBy: [{ sortNo: 'asc' }, { createdAt: 'asc' }] })).map(toSpec);
    const forms = tpls.map((spec) => {
      const list = rows.filter((r) => r.templateId === spec.id);
      const scoresOf = (key: string) => list.map((r) => (r.scores as Record<string, number> | null)?.[key]).filter((v): v is number => typeof v === 'number');
      const groups = spec.groups.map((g) => {
        const items = g.items.map((it) => {
          const vs = scoresOf(it.key);
          const histogram = Array.from({ length: SCORE_MAX + 1 }, (_, s) => vs.filter((v) => v === s).length); // 下标=分值
          return { key: it.key, label: it.label, count: vs.length, avg: avg(vs), good: vs.filter((v) => level(v) === 'good').length, mid: vs.filter((v) => level(v) === 'mid').length, bad: vs.filter((v) => level(v) === 'bad').length, histogram };
        });
        return { key: g.key, title: g.title, avg: avg(items.flatMap((i) => scoresOf(i.key))), items };
      });
      const all = formItems(spec).flatMap((i) => scoresOf(i.key));
      return {
        templateId: spec.id,
        title: spec.name,
        day: spec.day,
        count: list.length,
        avg: avg(all),
        satisfiedRate: all.length ? Math.round((all.filter((v) => level(v) === 'good').length / all.length) * 1000) / 10 : null,
        groups,
      };
    });
    // 得分最低的评分项（至少有 1 份回答）
    const lowItems = forms
      .flatMap((fm) => fm.groups.flatMap((g) => g.items.map((i) => ({ templateId: fm.templateId, formTitle: fm.title, groupTitle: g.title, key: i.key, label: i.label, avg: i.avg, count: i.count, bad: i.bad }))))
      .filter((i) => i.avg !== null)
      .sort((a, b) => a.avg! - b.avg!)
      .slice(0, 5);
    // 按月趋势：每张表每月的平均分
    const trend = new Map<string, { month: string; templateId: string; sum: number; n: number }>();
    for (const r of rows) {
      if (!r.surveyDate) continue;
      const spec = tpls.find((t) => t.id === r.templateId);
      if (!spec) continue;
      const sc = (r.scores as Record<string, number> | null) ?? {};
      for (const it of formItems(spec)) {
        if (typeof sc[it.key] !== 'number') continue;
        const key = `${dayStr(r.surveyDate).slice(0, 7)}|${spec.id}`;
        const t = trend.get(key) ?? { month: dayStr(r.surveyDate).slice(0, 7), templateId: spec.id, sum: 0, n: 0 };
        t.sum += sc[it.key];
        t.n += 1;
        trend.set(key, t);
      }
    }
    // 按管家：整体平均分
    const staff = new Map<string, { name: string; surveys: number; sum: number; n: number }>();
    for (const r of rows) {
      const name = r.stewardName?.trim();
      if (!name) continue;
      const sc = Object.values((r.scores as Record<string, number> | null) ?? {}).filter((v): v is number => typeof v === 'number');
      const s = staff.get(name) ?? { name, surveys: 0, sum: 0, n: 0 };
      s.surveys += 1;
      s.sum += sc.reduce((a, b) => a + b, 0);
      s.n += sc.length;
      staff.set(name, s);
    }
    return {
      total: rows.length,
      pending: await this.prisma.satisfactionSurvey.count({ where: this.where({ ...f, status: 'DRAFT' }) }),
      scoreMax: SCORE_MAX,
      forms,
      lowItems,
      trend: [...trend.values()].sort((a, b) => a.month.localeCompare(b.month) || a.templateId.localeCompare(b.templateId)).map((t) => ({ month: t.month, templateId: t.templateId, avg: Math.round((t.sum / t.n) * 100) / 100 })),
      staff: [...staff.values()].filter((s) => s.n > 0).map((s) => ({ name: s.name, surveys: s.surveys, avg: Math.round((s.sum / s.n) * 100) / 100 })).sort((a, b) => b.avg - a.avg),
    };
  }

  /** 已确认调查里客户手写的意见建议 / 表扬，按时间倒序 */
  async comments(f: SurveyFilter & { keyword?: string }) {
    const rows = await this.prisma.satisfactionSurvey.findMany({
      where: { ...this.where({ ...f, status: 'CONFIRMED' }), OR: [{ suggestion: { not: null } }, { praise: { not: null } }] },
      orderBy: [{ surveyDate: 'desc' }, { createdAt: 'desc' }],
      take: 300,
      select: { id: true, formNo: true, templateId: true, customerName: true, roomNo: true, stewardName: true, surveyDate: true, suggestion: true, praise: true },
    });
    return rows;
  }

  /** AI 归纳：把一批意见建议/表扬归成主题，给出出现次数和改进建议 */
  async summarize(f: SurveyFilter) {
    const rows = await this.comments(f);
    const sug = rows.filter((r) => r.suggestion).map((r, i) => `${i + 1}. ${r.suggestion!.replace(/\s+/g, ' ')}`);
    const pra = rows.filter((r) => r.praise).map((r, i) => `${i + 1}. ${r.praise!.replace(/\s+/g, ' ')}`);
    if (sug.length + pra.length === 0) return { content: '还没有客户手写的意见、建议或表扬，暂时没有可汇总的内容。', suggestionCount: 0, praiseCount: 0 };
    const prompt = [
      '你是月子中心的运营分析助手。下面是客户在满意度调查表上手写的内容（已由人工核对），请用简体中文做汇总分析，输出：',
      '1）【意见建议归类】按主题（如餐食、环境设施、服务态度、护理专业度、价格、其他）归类，每个主题写出现次数和代表性原话；',
      '2）【最需要优先改进的 3 件事】结合出现次数给出，并各给一条具体可落实的改进建议；',
      '3）【表扬汇总】被表扬的人、事、物各是什么，出现几次。',
      '只依据下面的内容，不要编造；某部分没有内容就写“暂无”。语言简洁，用条目列出。',
      '',
      `【意见建议】（共 ${sug.length} 条）`,
      sug.join('\n') || '无',
      '',
      `【表扬】（共 ${pra.length} 条）`,
      pra.join('\n') || '无',
    ].join('\n');
    const res = await this.aiGateway.complete([{ role: 'user', content: prompt }]);
    return { content: res.content, suggestionCount: sug.length, praiseCount: pra.length };
  }

  // ---------------- 内部 ----------------

  private fileName(f: Express.Multer.File): string {
    return Buffer.from(f.originalname, 'latin1').toString('utf8');
  }

  private async audit(action: 'CREATE' | 'UPDATE' | 'DELETE', id: string, data: Record<string, unknown>) {
    await this.auditLogService.record({
      action,
      entityType: 'SatisfactionSurvey',
      entityId: id,
      afterData: data as Prisma.InputJsonValue,
      tenantId: this.ctx.tenantId,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    });
  }

  /** 保存文件：HEIC 转 JPEG 展示（原图一并保留）；其他照片和 PDF 原样保存。存在护理资料同一个存储根目录下（备份一起带走）。 */
  private async saveFiles(surveyId: string, files: Express.Multer.File[], startOrder: number): Promise<void> {
    const dir = `satisfaction-${surveyId}`;
    let order = startOrder;
    for (const f of files) {
      const name = this.fileName(f);
      const stamp = Date.now();
      let storagePath: string;
      let originalPath: string | null = null;
      let mimeType = isPdf(f) ? 'application/pdf' : f.mimetype;
      let displayName = name;
      let size = f.size;
      if (isHeic(f)) {
        let jpeg: Buffer;
        try {
          jpeg = await this.aiGateway.normalizeImage(f.buffer);
        } catch (err) {
          throw new BadRequestException(`苹果 HEIC 照片转换失败（${(err as Error).message}）。请在手机上把照片分享为 JPG 再上传，或检查 AI 服务是否在运行`);
        }
        originalPath = await this.storage.save(dir, `${stamp}-orig-${name}`, f.buffer);
        displayName = name.replace(/\.[^.]+$/, '') + '.jpg';
        storagePath = await this.storage.save(dir, `${stamp}-${displayName}`, jpeg);
        mimeType = 'image/jpeg';
        size = jpeg.length;
      } else {
        storagePath = await this.storage.save(dir, `${stamp}-${name}`, f.buffer);
      }
      await this.prisma.satisfactionSurveyFile.create({
        data: { tenantId: this.ctx.tenantId!, surveyId, fileName: displayName, storagePath, originalPath, mimeType, sizeBytes: size, sortOrder: order++, createdBy: this.ctx.accountId! },
      });
    }
  }
}
