import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { AiGatewayClient, ContractExtractResult } from '../../ai/ai-gateway/ai-gateway.client';
import { ContractStorageService } from '../contract-storage/contract-storage.service';

/** 预估入住日期 = 预产期往后推几天。销售的习惯是推 3-5 天，取中间值 4 天，核对页里可改。 */
export const DEFAULT_CHECK_IN_OFFSET_DAYS = 4;
const MAX_CONCURRENT_EXTRACTIONS = 2;

/** 'YYYY-MM-DD'（UTC 零点）加 n 天。合同里的日期列是 DATE 类型，统一用 UTC 零点避免时区错位。 */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/**
 * 纸质合同的后台识别任务：调 AI 服务读图 → 保存逐页图片 → 把识别出的数据写进合同。
 * 是单例服务（不依赖请求上下文），因为上传接口返回后识别还要继续跑几十秒。
 * 同时最多跑 2 份，其余排队，避免把模型额度打满。
 */
@Injectable()
export class ContractExtractionService implements OnModuleInit {
  private readonly logger = new Logger(ContractExtractionService.name);
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ContractStorageService,
    private readonly aiGateway: AiGatewayClient,
    private readonly auditLogService: AuditLogService,
  ) {}

  /** 服务重启会中断正在跑的识别，把卡在"排队/识别中"的合同标为失败，提示用户重新识别。 */
  async onModuleInit(): Promise<void> {
    const res = await this.prisma.contract.updateMany({
      where: { extractStatus: { in: ['PENDING', 'RUNNING'] } },
      data: { extractStatus: 'FAILED', extractError: '服务重启时识别被中断，请点“重新识别”' },
    });
    if (res.count > 0) this.logger.warn(`已将 ${res.count} 份识别中断的合同标记为失败`);
  }

  /** 把识别任务放进后台队列，立即返回。 */
  enqueue(contractId: string, tenantId: string, accountId: string): void {
    void this.runQueued(contractId, tenantId, accountId);
  }

  private async runQueued(contractId: string, tenantId: string, accountId: string): Promise<void> {
    await this.prisma.contract.updateMany({ where: { id: contractId }, data: { extractStatus: 'PENDING', extractError: null } });
    if (this.active >= MAX_CONCURRENT_EXTRACTIONS) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.active += 1;
    try {
      await this.run(contractId, tenantId, accountId);
    } catch (err) {
      this.logger.error(`合同 ${contractId} 识别异常：${(err as Error).stack ?? err}`);
      await this.prisma.contract
        .updateMany({ where: { id: contractId }, data: { extractStatus: 'FAILED', extractError: (err as Error).message.slice(0, 500) } })
        .catch(() => undefined);
    } finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
  }

  private async run(contractId: string, tenantId: string, accountId: string): Promise<void> {
    await this.prisma.contract.updateMany({ where: { id: contractId }, data: { extractStatus: 'RUNNING' } });
    const originals = await this.prisma.contractFile.findMany({ where: { contractId, kind: 'ORIGINAL' }, orderBy: { createdAt: 'asc' } });
    if (originals.length === 0) throw new Error('这份合同没有上传原件，无法识别');

    const files = await Promise.all(originals.map(async (f) => ({ name: f.fileName, data: await this.storage.readBuffer(f.storagePath) })));
    const result = await this.aiGateway.extractContract(files);

    // 逐页图片：先清旧的再存新的（重新识别时）
    await this.storage.removePagesDir(contractId);
    await this.prisma.contractFile.deleteMany({ where: { contractId, kind: 'PAGE' } });
    for (const page of result.pages) {
      const rel = await this.storage.save(contractId, 'pages', `p${String(page.index).padStart(2, '0')}.jpg`, Buffer.from(page.jpeg_b64, 'base64'));
      await this.prisma.contractFile.create({
        data: {
          tenantId,
          contractId,
          kind: 'PAGE',
          fileName: `p${String(page.index).padStart(2, '0')}.jpg`,
          storagePath: rel,
          mimeType: 'image/jpeg',
          sizeBytes: Buffer.byteLength(page.jpeg_b64, 'base64'),
          pageNo: page.index,
          pageKind: page.kind,
          createdBy: accountId,
        },
      });
    }

    await this.applyResult(contractId, tenantId, accountId, result);
    this.logger.log(`合同 ${contractId} 识别完成：${result.pages.length} 页，${result.warnings.length} 条提醒，用时 ${result.latency_ms}ms`);
  }

  private async applyResult(contractId: string, tenantId: string, accountId: string, result: ContractExtractResult): Promise<void> {
    const d = result.data;
    const roomTypeId = await this.matchRoomType(tenantId, d.room_type_text);
    const dueDate = d.due_date ? new Date(d.due_date) : null;
    const estimatedCheckIn = dueDate ? addDays(dueDate, DEFAULT_CHECK_IN_OFFSET_DAYS) : null;
    const estimatedCheckOut = estimatedCheckIn && d.in_house_days ? addDays(estimatedCheckIn, d.in_house_days) : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.contract.update({
        where: { id: contractId },
        data: {
          paperNo: d.contract_no,
          signedDate: d.signed_date ? new Date(d.signed_date) : null,
          clientName: d.mother_name,
          clientPhone: d.phone,
          clientIdCardNo: d.id_card_no,
          clientHospital: d.hospital,
          clientAddress: d.address,
          emergencyName: d.emergency_name,
          emergencyRelation: d.emergency_relation,
          emergencyPhone: d.emergency_phone,
          fetus: d.fetus,
          dueDate,
          roomTypeText: d.room_type_text,
          roomTypeId,
          orientation: d.orientation,
          careMode: d.care_mode,
          inHouseDays: d.in_house_days,
          homeServiceDays: d.home_service_days ?? 0,
          daysText: d.days_text,
          amount: d.package_amount != null ? Math.round(d.package_amount * 100) : 0,
          depositAmount: d.deposit_amount != null ? Math.round(d.deposit_amount * 100) : null,
          estimatedCheckIn,
          estimatedCheckOut,
          extractStatus: 'DONE',
          extractError: null,
          extractWarnings: result.warnings as unknown as Prisma.InputJsonValue,
          extractedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await tx.contractItem.deleteMany({ where: { contractId } });
      if (d.gift_items.length > 0) {
        await tx.contractItem.createMany({
          data: d.gift_items.map((g, i) => ({
            tenantId,
            contractId,
            kind: 'GIFT' as const,
            name: g.name,
            quantity: g.quantity,
            needsReview: g.needs_review,
            sortOrder: i,
          })),
        });
      }
      await tx.contractExtraction.create({
        data: {
          tenantId,
          contractId,
          model: result.model,
          latencyMs: result.latency_ms,
          result: { data: d, warnings: result.warnings, raw_pages: result.raw_pages, focus: result.focus, focus_amounts: result.focus_amounts } as unknown as Prisma.InputJsonValue,
          createdBy: accountId,
        },
      });
    });

    await this.auditLogService.record({
      action: 'UPDATE',
      entityType: 'Contract',
      entityId: contractId,
      remark: `AI 识别完成（${result.model ?? '未知模型'}，${result.warnings.filter((w) => w.level !== 'info').length} 条需核对）`,
      tenantId,
      accountId,
    });
  }

  /** 合同上手写的房型原文（如“至臻(2间房-南-北)”）→ 系统里的房型：名称被包含就算匹配，多个时取名称最长的（至尊VIP 优先于 至尊）。 */
  async matchRoomType(tenantId: string, text: string | null): Promise<string | null> {
    if (!text) return null;
    const normalized = text.replace(/\s/g, '');
    const types = await this.prisma.roomType.findMany({ where: { tenantId }, select: { id: true, name: true } });
    const hits = types.filter((t) => t.name && normalized.includes(t.name.replace(/\s/g, '')));
    hits.sort((a, b) => b.name.length - a.name.length);
    return hits[0]?.id ?? null;
  }
}
