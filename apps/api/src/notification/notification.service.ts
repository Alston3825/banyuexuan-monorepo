import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type NotificationCategory =
  | 'APPROVAL'
  | 'APPROVAL_RESULT'
  | 'CC'
  | 'URGE'
  | 'CARE_PLAN'
  | 'CARE_DAILY'
  | 'REMINDER'
  | 'SYSTEM';
export type NotificationLevel = 'info' | 'warning' | 'danger' | 'success';

export interface NotifyPayload {
  tenantId: string;
  category: NotificationCategory;
  title: string;
  body?: string | null;
  link?: string | null;
  level?: NotificationLevel;
  /** 去重键：同一个人同一个键只发一次（定时扫描用；即时事件一般不填） */
  dedupKey?: string | null;
}

export const NOTIFICATION_CATEGORIES: Record<NotificationCategory, string> = {
  APPROVAL: '待我审批',
  APPROVAL_RESULT: '审批结果',
  CC: '抄送给我',
  URGE: '催办',
  CARE_PLAN: '护理计划',
  CARE_DAILY: '日常护理记录',
  REMINDER: '个人提醒',
  SYSTEM: '系统消息',
};

/** 消息保留天数：超过的自动清理 */
export const NOTIFICATION_RETENTION_DAYS = 90;

/**
 * 站内消息：不依赖请求上下文（定时任务里也能用），谁收、发什么都由调用方算好传进来。
 * 发消息失败只记日志、不抛错——通知是附带的，不能因为它把审批/保存客户这些主流程弄失败。
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async notify(
    accountIds: Array<string | null | undefined>,
    p: NotifyPayload,
  ): Promise<number> {
    const ids = [...new Set(accountIds.filter((x): x is string => !!x))];
    if (ids.length === 0) return 0;
    try {
      const r = await this.prisma.notification.createMany({
        data: ids.map((accountId) => ({
          tenantId: p.tenantId,
          accountId,
          category: p.category,
          level: p.level ?? 'info',
          title: p.title.slice(0, 200),
          body: p.body ? p.body.slice(0, 1000) : null,
          link: p.link ? p.link.slice(0, 300) : null,
          dedupKey: p.dedupKey ? p.dedupKey.slice(0, 191) : null,
        })),
        skipDuplicates: true,
      });
      return r.count;
    } catch (e) {
      this.logger.warn(`发送站内消息失败（${p.category} ${p.title}）：${e}`);
      return 0;
    }
  }

  /**
   * 某门店里持有某个权限点的在职员工（护理长/店长这类“管这家店的人”）。
   * 和审批找人同一套优先级：本店的人 → 范围覆盖本店的总部/区域人员 → 都没有就返回空（不去打扰无关的人）。
   */
  async accountsWithPermissionInStore(
    tenantId: string,
    permissionCode: string,
    storeId: string,
  ): Promise<string[]> {
    const now = new Date();
    const assigns = await this.prisma.accountRoleAssignment.findMany({
      where: {
        tenantId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        account: { status: 'ACTIVE' },
        role: {
          permissions: { some: { permissionPoint: { code: permissionCode } } },
        },
      },
      select: {
        accountId: true,
        scopeType: true,
        scopeId: true,
        account: { select: { storeId: true } },
      },
    });
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { regionId: true },
    });
    const local = assigns.filter(
      (a) =>
        a.account.storeId === storeId ||
        (a.scopeType === 'STORE' && a.scopeId === storeId),
    );
    const covering = assigns.filter(
      (a) =>
        a.scopeType === 'TENANT' ||
        (a.scopeType === 'REGION' && !!store && a.scopeId === store.regionId),
    );
    const matched = local.length > 0 ? local : covering;
    return [...new Set(matched.map((a) => a.accountId))];
  }

  // ---------- 给“我”看的：列表、未读数、已读 ----------

  async list(
    accountId: string,
    q: {
      unread?: boolean;
      category?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(q.pageSize) || 20));
    const where = {
      accountId,
      ...(q.unread ? { readAt: null } : {}),
      ...(q.category && q.category in NOTIFICATION_CATEGORIES
        ? { category: q.category }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  /** 未读数 + since 之后新到的消息（前端轮询用：新到的弹一下提示） */
  async summary(accountId: string, since?: string) {
    const sinceAt = since ? new Date(since) : null;
    const [unread, fresh, latest] = await Promise.all([
      this.prisma.notification.count({ where: { accountId, readAt: null } }),
      sinceAt && !isNaN(sinceAt.getTime())
        ? this.prisma.notification.findMany({
            where: { accountId, readAt: null, createdAt: { gt: sinceAt } },
            orderBy: { createdAt: 'desc' },
            take: 5,
          })
        : Promise.resolve([]),
      this.prisma.notification.findMany({
        where: { accountId },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
    ]);
    return { unread, fresh, latest, serverTime: new Date().toISOString() };
  }

  async markRead(accountId: string, id: string) {
    const row = await this.prisma.notification.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException('消息不存在');
    if (row.readAt) return row;
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(accountId: string, category?: string) {
    const r = await this.prisma.notification.updateMany({
      where: {
        accountId,
        readAt: null,
        ...(category && category in NOTIFICATION_CATEGORIES
          ? { category }
          : {}),
      },
      data: { readAt: new Date() },
    });
    return { updated: r.count };
  }

  async purgeOld(now = new Date()) {
    const r = await this.prisma.notification.deleteMany({
      where: {
        createdAt: {
          lt: new Date(now.getTime() - NOTIFICATION_RETENTION_DAYS * 86400_000),
        },
      },
    });
    return r.count;
  }
}
