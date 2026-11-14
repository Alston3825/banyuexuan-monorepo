import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { businessLabel, businessPath } from './workflow-business';

const HOUR = 3600_000;

/** 审批进度 / 审批中心 / 待办 的只读查询（带姓名、时限、是否超时）。 */
@Injectable()
export class WorkflowQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContextService,
  ) {}

  private async names(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((i) => i && i !== 'SYSTEM'))];
    if (unique.length === 0) return new Map();
    const rows = await this.prisma.account.findMany({ where: { id: { in: unique } }, select: { id: true, realName: true } });
    return new Map(rows.map((r) => [r.id, r.realName]));
  }

  /** 单据的审批进度：每个节点、每位审批人的状态、时限、意见，加上时间线和“我能做什么”。 */
  async progress(instanceId: string) {
    const instance = await this.prisma.workflowInstance.findFirst({
      where: { id: instanceId, tenantId: this.ctx.tenantId },
      include: {
        definition: { include: { nodes: { orderBy: { seq: 'asc' } } } },
        approvers: { orderBy: [{ nodeSeq: 'asc' }, { createdAt: 'asc' }] },
        actions: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!instance) throw new NotFoundException('审批单不存在');
    const rolesOf = (n: { approverRoleId: string | null; approverRoleIds: unknown }): string[] => (Array.isArray(n.approverRoleIds) && n.approverRoleIds.length > 0 ? (n.approverRoleIds as string[]) : n.approverRoleId ? [n.approverRoleId] : []);
    const acctsOf = (n: { approverAccountId: string | null; approverAccountIds: unknown }): string[] => (Array.isArray(n.approverAccountIds) && n.approverAccountIds.length > 0 ? (n.approverAccountIds as string[]) : n.approverAccountId ? [n.approverAccountId] : []);
    const roleIds = instance.definition.nodes.flatMap((n) => rolesOf(n));
    const roles = roleIds.length ? await this.prisma.role.findMany({ where: { id: { in: roleIds } }, select: { id: true, name: true } }) : [];
    const roleName = new Map(roles.map((r) => [r.id, r.name]));
    const nameOf = await this.names([
      instance.initiatorId,
      ...instance.approvers.map((a) => a.accountId),
      ...instance.actions.map((a) => a.actorId),
      ...instance.definition.nodes.flatMap((n) => acctsOf(n)),
    ]);
    const me = this.ctx.accountId!;
    const now = Date.now();
    const active = instance.status === 'IN_REVIEW';
    const cur = instance.currentNodeSeq ?? -1;

    const nodes = instance.definition.nodes.map((n) => {
      const rows = instance.approvers.filter((a) => a.nodeSeq === n.seq && a.role !== 'CC');
      let state: 'DONE' | 'CURRENT' | 'WAITING' | 'REJECTED' | 'WITHDRAWN' | 'SKIPPED' = 'WAITING';
      if (['APPROVED', 'ARCHIVED'].includes(instance.status)) state = rows.length ? 'DONE' : 'SKIPPED';
      else if (instance.status === 'REJECTED') state = n.seq < cur ? 'DONE' : n.seq === cur ? 'REJECTED' : 'WAITING';
      else if (instance.status === 'WITHDRAWN') state = n.seq < cur ? 'DONE' : n.seq === cur ? 'WITHDRAWN' : 'WAITING';
      else if (active) state = n.seq < cur ? 'DONE' : n.seq === cur ? 'CURRENT' : 'WAITING';
      const plannedParts = [
        ...(rolesOf(n).length > 0 ? [`角色：${rolesOf(n).map((id) => roleName.get(id) ?? '（角色已删除）').join('、')}`] : []),
        ...(acctsOf(n).length > 0 ? [`指定：${acctsOf(n).map((id) => nameOf.get(id) ?? '某位员工').join('、')}`] : []),
      ];
      const planned = plannedParts.join('；') || '（未设置）';
      return {
        seq: n.seq,
        name: n.name,
        mode: n.approvalMode,
        timeoutHours: n.timeoutHours,
        state,
        planned,
        approvers: rows.map((a) => {
          const dueAt = a.status === 'PENDING' && n.timeoutHours ? new Date(a.createdAt.getTime() + n.timeoutHours * HOUR) : null;
          return {
            accountId: a.accountId,
            name: nameOf.get(a.accountId) ?? a.accountId,
            role: a.role,
            status: a.status,
            comment: a.comment,
            actedAt: a.actedAt,
            arrivedAt: a.createdAt,
            dueAt,
            overdue: !!dueAt && dueAt.getTime() < now,
          };
        }),
      };
    });

    const urges = instance.actions.filter((a) => a.action === 'URGE');
    const pendingMine = active && instance.approvers.some((a) => a.accountId === me && a.nodeSeq === cur && a.status === 'PENDING' && a.role !== 'CC');
    return {
      id: instance.id,
      title: instance.title,
      status: instance.status,
      businessType: instance.businessType,
      businessLabel: businessLabel(instance.businessType),
      businessId: instance.businessId,
      businessPath: businessPath(instance.businessType),
      definitionName: instance.definition.name,
      submittedAt: instance.submittedAt,
      finishedAt: instance.finishedAt,
      currentNodeSeq: instance.currentNodeSeq,
      initiator: { id: instance.initiatorId, name: nameOf.get(instance.initiatorId) ?? instance.initiatorId },
      nodes,
      ccs: instance.approvers.filter((a) => a.role === 'CC').map((a) => ({ accountId: a.accountId, name: nameOf.get(a.accountId) ?? a.accountId })),
      actions: instance.actions.map((a) => ({ id: a.id, action: a.action, nodeSeq: a.nodeSeq, comment: a.comment, createdAt: a.createdAt, actorId: a.actorId, actorName: a.actorId === 'SYSTEM' ? '系统' : nameOf.get(a.actorId) ?? a.actorId })),
      urgeCount: urges.length,
      lastUrgedAt: urges.length ? urges[urges.length - 1].createdAt : null,
      me: {
        canApprove: pendingMine,
        canWithdraw: instance.initiatorId === me && ['SUBMITTED', 'IN_REVIEW'].includes(instance.status),
        canUrge: instance.initiatorId === me && active,
        canReassignAsAdmin: active && (await this.ctx.hasPermission('workflow.definition.update')),
      },
    };
  }

  /** 按业务单据（类型+id）取最近一条审批的 id，没有就返回 null。 */
  async instanceIdByBusiness(businessType: string, businessId: string): Promise<string | null> {
    const row = await this.prisma.workflowInstance.findFirst({
      where: { tenantId: this.ctx.tenantId, businessType, businessId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  /** 我当前待审批的（带到达时间、时限、是否超时、被催办次数）。todo 汇总也用它。 */
  async pendingForMe(limit = 200) {
    const me = this.ctx.accountId!;
    const rows = await this.prisma.workflowInstanceApprover.findMany({
      where: { accountId: me, status: 'PENDING', role: { in: ['APPROVER', 'ADDED_APPROVER'] }, instance: { tenantId: this.ctx.tenantId, status: 'IN_REVIEW' } },
      include: { instance: { include: { definition: { include: { nodes: true } }, actions: { where: { action: 'URGE' }, select: { nodeSeq: true } } } } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    const current = rows.filter((r) => r.nodeSeq === r.instance.currentNodeSeq);
    const nameOf = await this.names(current.map((r) => r.instance.initiatorId));
    const now = Date.now();
    return current.map((r) => {
      const node = r.instance.definition.nodes.find((n) => n.seq === r.nodeSeq);
      const dueAt = node?.timeoutHours ? new Date(r.createdAt.getTime() + node.timeoutHours * HOUR) : null;
      return {
        instanceId: r.workflowInstanceId,
        title: r.instance.title,
        businessType: r.instance.businessType,
        businessLabel: businessLabel(r.instance.businessType),
        initiatorName: nameOf.get(r.instance.initiatorId) ?? '',
        nodeName: node?.name ?? '',
        arrivedAt: r.createdAt,
        dueAt,
        overdue: !!dueAt && dueAt.getTime() < now,
        urgeCount: r.instance.actions.filter((a) => a.nodeSeq === r.nodeSeq).length,
      };
    });
  }

  /** 审批中心四个页签：pending 待我审批 / done 我已处理 / mine 我发起的 / cc 抄送我的。 */
  async approvals(tab: 'pending' | 'done' | 'mine' | 'cc', keyword?: string) {
    const me = this.ctx.accountId!;
    const kw = keyword?.trim();
    const titleFilter = kw ? { title: { contains: kw } } : {};
    const tenantId = this.ctx.tenantId;

    if (tab === 'pending') {
      const list = await this.pendingForMe();
      return list.filter((r) => !kw || r.title.includes(kw) || r.businessLabel.includes(kw)).map((r) => ({ ...r, status: 'IN_REVIEW' }));
    }

    if (tab === 'mine') {
      const rows = await this.prisma.workflowInstance.findMany({
        where: { tenantId, initiatorId: me, ...titleFilter },
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { definition: { include: { nodes: true } }, approvers: { where: { status: 'PENDING', role: { in: ['APPROVER', 'ADDED_APPROVER'] } } }, actions: { where: { action: 'URGE' }, select: { id: true } } },
      });
      const nameOf = await this.names(rows.flatMap((r) => r.approvers.map((a) => a.accountId)));
      return rows.map((r) => {
        const node = r.definition.nodes.find((n) => n.seq === r.currentNodeSeq);
        const waiting = r.status === 'IN_REVIEW' ? r.approvers.filter((a) => a.nodeSeq === r.currentNodeSeq) : [];
        const earliest = waiting.length ? Math.min(...waiting.map((a) => a.createdAt.getTime())) : null;
        const dueAt = earliest && node?.timeoutHours ? new Date(earliest + node.timeoutHours * HOUR) : null;
        return {
          instanceId: r.id,
          title: r.title,
          businessType: r.businessType,
          businessLabel: businessLabel(r.businessType),
          status: r.status,
          submittedAt: r.submittedAt,
          finishedAt: r.finishedAt,
          nodeName: r.status === 'IN_REVIEW' ? node?.name ?? '' : '',
          waitingFor: waiting.map((a) => nameOf.get(a.accountId) ?? '').filter(Boolean),
          dueAt,
          overdue: !!dueAt && dueAt.getTime() < Date.now(),
          urgeCount: r.actions.length,
        };
      });
    }

    const rows = await this.prisma.workflowInstanceApprover.findMany({
      where: tab === 'done'
        ? { accountId: me, status: { in: ['APPROVED', 'REJECTED'] }, instance: { tenantId, ...titleFilter } }
        : { accountId: me, role: 'CC', instance: { tenantId, ...titleFilter } },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      include: { instance: true },
    });
    const nameOf = await this.names(rows.map((r) => r.instance.initiatorId));
    const seen = new Set<string>();
    return rows
      .filter((r) => (seen.has(r.workflowInstanceId) ? false : (seen.add(r.workflowInstanceId), true)))
      .map((r) => ({
        instanceId: r.workflowInstanceId,
        title: r.instance.title,
        businessType: r.instance.businessType,
        businessLabel: businessLabel(r.instance.businessType),
        status: r.instance.status,
        initiatorName: nameOf.get(r.instance.initiatorId) ?? '',
        submittedAt: r.instance.submittedAt,
        myStatus: r.status,
        myComment: r.comment,
        actedAt: r.actedAt,
      }));
  }
}
