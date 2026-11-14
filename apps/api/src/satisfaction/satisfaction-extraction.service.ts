import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiGatewayClient } from '../ai/ai-gateway/ai-gateway.client';
import { CareStorageService } from '../care/care-document/care-storage.service';
import { formItems, SCORE_MAX, surveyAiSpec } from './survey-specs';
import { toSpec } from './satisfaction-template.service';

const MAX_CONCURRENT = 2;

/** 把纸上手写的“10.24”“10/24”“2026.10.24”变成日期；没年份就按上传当年，月份比当前月还晚（跨年补填）则算去年。 */
export function parseSheetDate(raw: unknown, now = new Date()): Date | null {
  const m = String(raw ?? '').match(/(?:(\d{4})\s*[.\-/年]\s*)?(\d{1,2})\s*[.\-/月]\s*(\d{1,2})/);
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let year = m[1] ? Number(m[1]) : now.getFullYear();
  if (!m[1] && month > now.getMonth() + 1) year -= 1;
  const d = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * 满意度调查纸质表的后台识别：读取照片 → AI 按字段说明书读出每个评分项打勾的分值和手写意见 → 写进调查记录（草稿）。
 * 单例（不依赖请求上下文），同时最多 2 份。识别结果必须人工核对确认后才计入统计。
 */
@Injectable()
export class SatisfactionExtractionService implements OnModuleInit {
  private readonly logger = new Logger(SatisfactionExtractionService.name);
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: CareStorageService,
    private readonly aiGateway: AiGatewayClient,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.prisma.satisfactionSurvey.updateMany({
      where: { extractStatus: { in: ['PENDING', 'RUNNING'] } },
      data: { extractStatus: 'FAILED', extractError: '服务重启时识别被中断，请点“重新识别”' },
    });
  }

  enqueue(id: string): void {
    void this.runQueued(id);
  }

  private async runQueued(id: string): Promise<void> {
    await this.prisma.satisfactionSurvey.updateMany({ where: { id }, data: { extractStatus: 'PENDING', extractError: null } });
    if (this.active >= MAX_CONCURRENT) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active += 1;
    try {
      await this.run(id);
    } catch (err) {
      this.logger.error(`满意度调查 ${id} 识别异常：${(err as Error).stack ?? err}`);
      await this.prisma.satisfactionSurvey.updateMany({ where: { id }, data: { extractStatus: 'FAILED', extractError: (err as Error).message.slice(0, 500) } }).catch(() => undefined);
    } finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
  }

  private async run(id: string): Promise<void> {
    const survey = await this.prisma.satisfactionSurvey.findUnique({ where: { id }, include: { files: { orderBy: { sortOrder: 'asc' } } } });
    if (!survey) return;
    const tpl = survey.templateId ? await this.prisma.satisfactionTemplate.findUnique({ where: { id: survey.templateId } }) : null;
    if (!tpl) throw new Error('这份调查对应的模板不存在');
    const spec = toSpec(tpl);
    if (survey.files.length === 0) throw new Error('还没有上传照片，无法识别');
    await this.prisma.satisfactionSurvey.update({ where: { id }, data: { extractStatus: 'RUNNING' } });

    const files = await Promise.all(survey.files.map(async (f) => ({ name: f.fileName, data: await this.storage.readBuffer(f.storagePath) })));
    const result = await this.aiGateway.extractCareForm(surveyAiSpec(spec), files);
    const data = result.data;
    const warnings = [...result.warnings] as { field: string; level: string; message: string }[];

    const scores: Record<string, number> = {};
    for (const item of formItems(spec)) {
      const v = Number(data[item.key]);
      if (data[item.key] !== null && data[item.key] !== undefined && Number.isInteger(v) && v >= 0 && v <= SCORE_MAX) scores[item.key] = v;
      else if (!warnings.some((w) => w.field === item.key)) warnings.push({ field: item.key, level: 'info', message: '没识别到打勾的分值（客户可能没填），请对照原图核对' });
    }
    const text = (k: string) => (typeof data[k] === 'string' && (data[k] as string).trim() ? (data[k] as string).trim() : null);
    const customerName = text('customerName');
    // 姓名唯一对上一位客户就自动关联（对不上或重名的留给人工选）
    let customerId: string | null = null;
    let storeId: string | null = survey.storeId;
    if (customerName) {
      const matches = await this.prisma.customer.findMany({ where: { tenantId: survey.tenantId, name: customerName }, select: { id: true, primaryStoreId: true }, take: 2 });
      if (matches.length === 1) {
        customerId = matches[0].id;
        storeId = storeId ?? matches[0].primaryStoreId;
      } else {
        warnings.push({ field: 'customerName', level: 'warn', message: matches.length === 0 ? '系统里没有找到同名客户，请手动选择对应的客户' : '有多位同名客户，请手动选择对应的客户' });
      }
    }
    const surveyDate = parseSheetDate(data.surveyDate);
    if (!surveyDate) warnings.push({ field: 'surveyDate', level: 'warn', message: '没读出填写日期，请补上' });

    await this.prisma.satisfactionSurvey.update({
      where: { id },
      data: {
        customerId: survey.customerId ?? customerId,
        storeId,
        customerName,
        roomNo: text('roomNo'),
        stewardName: text('stewardName'),
        nurseName: text('nurseName'),
        phone: text('phone'),
        surveyDate,
        scores: scores as Prisma.InputJsonValue,
        suggestion: text('suggestion'),
        praise: text('praise'),
        extractStatus: 'DONE',
        extractError: null,
        extractWarnings: warnings as unknown as Prisma.InputJsonValue,
        extractModel: result.model,
        extractedAt: new Date(),
      },
    });
    this.logger.log(`满意度调查 ${id}（${spec.name}）识别完成：${Object.keys(scores).length}/${formItems(spec).length} 项评分，${warnings.length} 条提醒`);
  }
}
