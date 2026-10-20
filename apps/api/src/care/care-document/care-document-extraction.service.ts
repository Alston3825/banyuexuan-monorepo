import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AiGatewayClient } from '../../ai/ai-gateway/ai-gateway.client';
import { allFields, FieldSpec, FORM_SPECS, AssessmentType } from '../care-assessment/assessment-specs';
import { MED_AI_DESCRIPTION, MED_HEADER_FIELDS, MED_ITEM_COLUMNS } from '../care-medication/medication-specs';
import { DAILY_AI_DESCRIPTION, DAILY_BABY_AI_DESCRIPTION, DAILY_BABY_FIELDS, dailyFlatFields, FEEDING_COLUMNS } from '../care-daily/daily-specs';
import { serviceSheetAiSpec } from '../care-plan-version/service-sheet-specs';
import { CareStorageService } from './care-storage.service';

const MAX_CONCURRENT = 2;

/**
 * 护理纸质表格的后台识别任务：读取已上传的照片 → 调 AI 服务按字段说明书识别 → 结果放进
 * CareDocument.extractData（只是草稿，要在复核页由人确认后才入评估表）。
 * 单例服务（不依赖请求上下文）；同时最多 2 份，其余排队。
 */
@Injectable()
export class CareDocumentExtractionService implements OnModuleInit {
  private readonly logger = new Logger(CareDocumentExtractionService.name);
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: CareStorageService,
    private readonly aiGateway: AiGatewayClient,
  ) {}

  /** 服务重启会中断正在跑的识别，把卡在"排队/识别中"的资料标为失败，提示重新识别。 */
  async onModuleInit(): Promise<void> {
    const res = await this.prisma.careDocument.updateMany({
      where: { extractStatus: { in: ['PENDING', 'RUNNING'] } },
      data: { extractStatus: 'FAILED', extractError: '服务重启时识别被中断，请点“重新识别”' },
    });
    if (res.count > 0) this.logger.warn(`已将 ${res.count} 份识别中断的护理资料标记为失败`);
  }

  isStructured(docType: string): boolean {
    return docType in FORM_SPECS || docType === 'DAILY_RECORD' || docType === 'MEDICATION_AUTH' || docType === 'CARE_PLAN';
  }

  /** 给 AI 的字段说明书：四张评估表按各自字段；日常护理记录 = 妈妈栏 + 宝宝栏 + 喂养记录表（table）。 */
  private aiSpec(docType: string, scope?: string | null): { formTitle: string; description: string; fields: unknown[] } | null {
    const slim = (f: FieldSpec) => ({ key: f.key, label: f.label, kind: f.kind, options: f.options, unit: f.unit, min: f.min, max: f.max, aiHint: f.aiHint });
    if (docType === 'DAILY_RECORD' && scope === 'BABY_FEEDING') {
      // 宝宝单页（《新生儿日常护理记录》）：只读宝宝体征 + 喂养表，不读妈妈栏，也就没有一堆“妈妈字段没识别出来”的噪音提醒
      return {
        formTitle: '新生儿日常护理记录（宝宝单页）',
        description: DAILY_BABY_AI_DESCRIPTION,
        fields: [
          { key: 'sheetDate', label: '纸上的日期', kind: 'text', aiHint: '右上角“日期：”后手写的日期，如 8.26，原样抄下来' },
          ...DAILY_BABY_FIELDS.flatMap((g) => g.fields).map(slim),
          { key: 'feedings', label: '24小时宝宝喂养记录单', kind: 'table', columns: FEEDING_COLUMNS.map(slim) },
        ],
      };
    }
    if (docType === 'DAILY_RECORD') {
      return {
        formTitle: '新生儿和产妇日常护理记录',
        description: DAILY_AI_DESCRIPTION,
        fields: [{ key: 'sheetDate', label: '纸上的日期', kind: 'text', aiHint: '右上角“日期：”后手写的日期，如 10.18，原样抄下来' }, ...dailyFlatFields().map(slim), { key: 'feedings', label: '24小时宝宝喂养记录单', kind: 'table', columns: FEEDING_COLUMNS.map(slim) }],
      };
    }
    if (docType === 'CARE_PLAN') return serviceSheetAiSpec(); // 产妇常规护理计划统计表 → 服务执行记录
    if (docType === 'MEDICATION_AUTH') {
      return {
        formTitle: '新生儿用药服药喂药委托书',
        description: MED_AI_DESCRIPTION,
        fields: [...MED_HEADER_FIELDS.map(slim), { key: 'items', label: '药品表格', kind: 'table', columns: MED_ITEM_COLUMNS.map(slim) }],
      };
    }
    const spec = FORM_SPECS[docType as AssessmentType];
    return spec ? { formTitle: spec.title, description: spec.aiDescription, fields: allFields(spec).map(slim) } : null;
  }

  /**
   * 纸上“男：睾丸…”“女：阴道分泌物…”两套栏目都印着，AI 有时会把另一个性别栏也填上。
   * 已知宝宝性别时，把另一个性别的栏目（标签以“男/女”开头）的识别结果和提醒去掉。
   */
  private async dropOtherSexFields(babyProfileId: string | null, fields: { key: string; label: string }[], result: { data: Record<string, unknown>; warnings: { field: string }[] }): Promise<void> {
    if (!babyProfileId) return;
    const baby = await this.prisma.babyProfile.findUnique({ where: { id: babyProfileId }, select: { gender: true } });
    if (baby?.gender !== 'MALE' && baby?.gender !== 'FEMALE') return;
    const other = baby.gender === 'MALE' ? '女' : '男';
    const drop = new Set(fields.filter((f) => f.label.startsWith(other)).map((f) => f.key));
    if (drop.size === 0) return;
    for (const k of drop) delete result.data[k];
    result.warnings = result.warnings.filter((w) => !drop.has(w.field));
  }

  enqueue(documentId: string): void {
    void this.runQueued(documentId);
  }

  private async runQueued(documentId: string): Promise<void> {
    await this.prisma.careDocument.updateMany({ where: { id: documentId }, data: { extractStatus: 'PENDING', extractError: null } });
    if (this.active >= MAX_CONCURRENT) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active += 1;
    try {
      await this.run(documentId);
    } catch (err) {
      this.logger.error(`护理资料 ${documentId} 识别异常：${(err as Error).stack ?? err}`);
      await this.prisma.careDocument
        .updateMany({ where: { id: documentId }, data: { extractStatus: 'FAILED', extractError: (err as Error).message.slice(0, 500) } })
        .catch(() => undefined);
    } finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
  }

  private async run(documentId: string): Promise<void> {
    const doc = await this.prisma.careDocument.findUnique({ where: { id: documentId }, include: { files: { orderBy: { sortOrder: 'asc' } } } });
    if (!doc) return;
    const spec = this.aiSpec(doc.docType, doc.extractScope);
    if (!spec) throw new Error('这类资料只做拍照留档，不需要识别');
    if (doc.files.length === 0) throw new Error('还没有上传照片，无法识别');
    await this.prisma.careDocument.update({ where: { id: documentId }, data: { extractStatus: 'RUNNING' } });

    const files = await Promise.all(doc.files.map(async (f) => ({ name: f.fileName, data: await this.storage.readBuffer(f.storagePath) })));
    const result = await this.aiGateway.extractCareForm(spec, files);
    await this.dropOtherSexFields(doc.babyProfileId, spec.fields as { key: string; label: string }[], result);
    await this.prisma.careDocument.update({
      where: { id: documentId },
      data: {
        extractStatus: 'DONE',
        extractError: null,
        extractData: result.data as Prisma.InputJsonValue,
        extractWarnings: result.warnings as unknown as Prisma.InputJsonValue,
        extractModel: result.model,
        extractedAt: new Date(),
      },
    });
    this.logger.log(`护理资料 ${documentId}（${doc.docType}）识别完成：${Object.keys(result.data).length} 个字段，${result.warnings.length} 条提醒，用时 ${result.latency_ms}ms`);
  }
}
