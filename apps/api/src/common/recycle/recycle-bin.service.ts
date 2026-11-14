import { ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../context/request-context.service';
import { CareStorageService } from '../../care/care-document/care-storage.service';
import { CollectOptions, TreeCollector, deleteSnapshot, parseSnapshot, restoreSnapshot, serializeSnapshot, summarizeSnapshot } from './recycle-tree.util';

export const RECYCLE_KEEP_DAYS = 30;

export interface RecycleDeleteParams {
  entityType: 'CUSTOMER' | 'MOTHER_PROFILE';
  rootTable: string;
  rootId: string;
  title: string;
  reason?: string;
  collectOptions?: CollectOptions;
  /** 补充没有外键的多态关联（标签绑定、跟进记录等） */
  addExtras?: (c: TreeCollector) => Promise<void>;
  /** 在同一个事务里、删除之前做的事（如合并时把关联转移走） */
  beforeDelete?: (tx: Prisma.TransactionClient) => Promise<void>;
}

/**
 * 回收站：删除前把记录及名下所有数据存成快照（30 天），期内可原样还原；到期自动清除（连磁盘上的纸质资料文件一起）。
 */
@Injectable()
export class RecycleBinService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecycleBinService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContextService,
    private readonly storage: CareStorageService,
    private readonly auditLogService: AuditLogService,
  ) {}

  onModuleInit() {
    // 每小时清一次过期项；开机后稍等再跑一次
    this.timer = setInterval(() => void this.purgeExpired().catch((e) => this.logger.warn(`清理回收站失败：${e}`)), 60 * 60 * 1000);
    this.timer.unref();
    setTimeout(() => void this.purgeExpired().catch(() => undefined), 30 * 1000).unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** 收集 → 存快照 → 删除，同一个事务。返回回收站条目 id 与摘要。 */
  async deleteToBin(p: RecycleDeleteParams): Promise<{ itemId: string; summary: string }> {
    const tenantId = this.ctx.tenantId!;
    return this.prisma.$transaction(
      async (tx) => {
        if (p.beforeDelete) await p.beforeDelete(tx);
        const c = new TreeCollector(tx, p.collectOptions);
        await c.collect(p.rootTable, [p.rootId]);
        if (p.addExtras) await p.addExtras(c);
        // 审批实例也算它的数据：引用了已收集记录的 workflow_instances
        const allIds = [...c.seen.values()].flatMap((s) => [...s]);
        await c.collectByIdColumn('workflow_instances', 'business_id', allIds);
        const snap = c.snapshot();
        const docIds = (snap.groups.find((g) => g.table === 'care_documents')?.rows ?? []).map((r) => String(r.id));
        const summary = summarizeSnapshot(snap, p.rootTable);
        const item = await tx.recycleBinItem.create({
          data: {
            tenantId,
            entityType: p.entityType,
            entityId: p.rootId,
            title: p.title,
            summary: summary || null,
            payload: serializeSnapshot(snap),
            fileDocIds: docIds.length > 0 ? docIds : Prisma.JsonNull,
            reason: p.reason ?? null,
            deletedBy: this.ctx.accountId!,
            expiresAt: new Date(Date.now() + RECYCLE_KEEP_DAYS * 24 * 3600 * 1000),
          },
        });
        await deleteSnapshot(tx, snap);
        return { itemId: item.id, summary };
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
  }

  async list(entityType?: string) {
    const rows = await this.prisma.recycleBinItem.findMany({
      where: { tenantId: this.ctx.tenantId, entityType: entityType || undefined, expiresAt: { gt: new Date() } },
      select: { id: true, entityType: true, entityId: true, title: true, summary: true, reason: true, deletedBy: true, deletedAt: true, expiresAt: true },
      orderBy: { deletedAt: 'desc' },
    });
    const accounts = await this.prisma.account.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.deletedBy))] } }, select: { id: true, realName: true } });
    const names = new Map(accounts.map((a) => [a.id, a.realName]));
    return rows.map((r) => ({ ...r, deletedByName: names.get(r.deletedBy) ?? null }));
  }

  async restore(id: string): Promise<{ title: string; entityType: string; entityId: string }> {
    const item = await this.findItem(id);
    if (item.expiresAt.getTime() < Date.now()) throw new ConflictException('这条已超过保留期限');
    const snap = parseSnapshot(item.payload);
    try {
      await this.prisma.$transaction(
        async (tx) => {
          await restoreSnapshot(tx, snap);
          await tx.recycleBinItem.delete({ where: { id } });
        },
        { timeout: 120_000, maxWait: 10_000 },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`还原回收站 ${id} 失败：${msg}`);
      if (/Duplicate entry|1062/.test(msg)) throw new ConflictException('还原失败：系统里已经有相同编号的记录（可能已经重新建过）');
      if (/foreign key|1452|Cannot add or update a child row/i.test(msg)) throw new ConflictException('还原失败：它关联的房间/员工等基础资料已被删除，无法接回');
      throw new ConflictException(`还原失败：${msg.slice(0, 200)}`);
    }
    await this.auditLogService.record({
      action: 'UPDATE',
      entityType: item.entityType === 'CUSTOMER' ? 'Customer' : 'MotherProfile',
      entityId: item.entityId,
      remark: `从回收站还原「${item.title}」${item.summary ? `（含 ${item.summary}）` : ''}`,
      tenantId: this.ctx.tenantId,
      storeId: this.ctx.homeStoreId,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
    });
    return { title: item.title, entityType: item.entityType, entityId: item.entityId };
  }

  /** 立即彻底删除（不可再还原），连纸质资料文件。 */
  async purge(id: string): Promise<void> {
    const item = await this.findItem(id);
    await this.prisma.recycleBinItem.delete({ where: { id } });
    await this.removeFiles(item.fileDocIds);
    await this.auditLogService.record({
      action: 'DELETE',
      entityType: item.entityType === 'CUSTOMER' ? 'Customer' : 'MotherProfile',
      entityId: item.entityId,
      remark: `从回收站彻底删除「${item.title}」`,
      tenantId: this.ctx.tenantId,
      storeId: this.ctx.homeStoreId,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
    });
  }

  async purgeExpired(): Promise<number> {
    const expired = await this.prisma.recycleBinItem.findMany({ where: { expiresAt: { lte: new Date() } }, select: { id: true, fileDocIds: true } });
    for (const e of expired) {
      await this.prisma.recycleBinItem.delete({ where: { id: e.id } }).catch(() => undefined);
      await this.removeFiles(e.fileDocIds);
    }
    return expired.length;
  }

  private async findItem(id: string) {
    const item = await this.prisma.recycleBinItem.findUnique({ where: { id } });
    if (!item || item.tenantId !== this.ctx.tenantId) throw new NotFoundException('回收站里没有这一项（可能已还原或已过期清除）');
    return item;
  }

  private async removeFiles(fileDocIds: Prisma.JsonValue | null) {
    if (!Array.isArray(fileDocIds)) return;
    for (const d of fileDocIds) await this.storage.removeDocumentDir(String(d)).catch(() => undefined);
  }
}
