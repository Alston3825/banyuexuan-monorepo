import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AuditAction, WorkflowAction, WorkflowInstance } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { ActorContext, SYSTEM_ACTOR } from '../../common/context/actor-context';
import { WORKFLOW_ARCHIVE_QUEUE } from '../../queue/queue.constants';

export interface StartInstanceParams {
  definitionCode: string;
  businessType: string;
  businessId: string;
  title: string;
  storeId?: string | null;
}

@Injectable()
export class WorkflowEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    @InjectQueue(WORKFLOW_ARCHIVE_QUEUE)
    private readonly archiveQueue: Queue,
  ) {}

  async startInstance(params: StartInstanceParams, actor: ActorContext): Promise<WorkflowInstance> {
    const definition = await this.prisma.workflowDefinition.findFirst({
      where: { tenantId: actor.tenantId!, code: params.definitionCode, status: 'PUBLISHED' },
      orderBy: { version: 'desc' },
      include: { nodes: { orderBy: { seq: 'asc' } } },
    });
    if (!definition) {
      throw new NotFoundException(`这类单据的审批流程已停用或还没设置，请联系管理员到“审批流程设置”里启用（${params.definitionCode}）`);
    }
    const first = definition.nodes[0];
    if (first) {
      const people = await this.resolveApprovers(this.nodeRoleIds(first), this.nodeAccountIds(first), params.storeId);
      if (people.length === 0) {
        throw new ConflictException(`审批流程「${definition.name}」的第一个节点「${first.name}」当前没有可审批的人（对应角色没有分配给任何在职员工），请联系管理员到“审批流程设置”里处理`);
      }
    }

    const instance = await this.prisma.workflowInstance.create({
      data: {
        tenantId: actor.tenantId!,
        storeId: params.storeId,
        workflowDefinitionId: definition.id,
        businessType: params.businessType,
        businessId: params.businessId,
        title: params.title,
        status: 'SUBMITTED',
        initiatorId: actor.accountId!,
        submittedAt: new Date(),
        createdBy: actor.accountId!,
      },
    });

    await this.logAction(instance.id, null, 'SUBMIT', actor.accountId, undefined);
    await this.auditRecord('STATE_TRANSITION', instance.id, actor, { status: 'SUBMITTED' });

    const firstNode = definition.nodes[0];
    await this.advanceToNode(instance.id, firstNode?.seq ?? null, definition.id);
    return this.getInstanceOrThrow(instance.id);
  }

  async approve(instanceId: string, actor: ActorContext, comment?: string): Promise<WorkflowInstance> {
    const instance = await this.getInstanceOrThrow(instanceId);
    if (instance.status !== 'IN_REVIEW') {
      throw new ConflictException('当前状态不可审批');
    }
    const approverRow = await this.prisma.workflowInstanceApprover.findFirst({
      where: {
        workflowInstanceId: instanceId,
        nodeSeq: instance.currentNodeSeq ?? -1,
        accountId: actor.accountId,
        role: { in: ['APPROVER', 'ADDED_APPROVER'] },
        status: 'PENDING',
      },
    });
    if (!approverRow) {
      throw new ForbiddenException('您当前不是该审批节点的待审批人');
    }

    await this.prisma.workflowInstanceApprover.update({
      where: { id: approverRow.id },
      data: { status: 'APPROVED', comment, actedAt: new Date() },
    });
    await this.logAction(instanceId, instance.currentNodeSeq, 'APPROVE', actor.accountId, comment);
    await this.auditRecord('APPROVE', instanceId, actor, { nodeSeq: instance.currentNodeSeq });

    // 或签（ANY）节点：任意一人通过即算本节点通过，其余待审批人标记为“已跳过”
    const currentNode = await this.prisma.workflowNode.findUnique({
      where: { workflowDefinitionId_seq: { workflowDefinitionId: instance.workflowDefinitionId, seq: instance.currentNodeSeq ?? -1 } },
    });
    if (currentNode?.approvalMode === 'ANY') {
      await this.prisma.workflowInstanceApprover.updateMany({
        where: { workflowInstanceId: instanceId, nodeSeq: instance.currentNodeSeq ?? -1, role: { in: ['APPROVER', 'ADDED_APPROVER'] }, status: 'PENDING' },
        data: { status: 'SKIPPED', actedAt: new Date() },
      });
    }

    const pendingCount = await this.prisma.workflowInstanceApprover.count({
      where: {
        workflowInstanceId: instanceId,
        nodeSeq: instance.currentNodeSeq ?? -1,
        role: { in: ['APPROVER', 'ADDED_APPROVER'] },
        status: 'PENDING',
      },
    });
    if (pendingCount > 0) {
      return this.getInstanceOrThrow(instanceId);
    }

    const definition = await this.prisma.workflowDefinition.findUnique({
      where: { id: instance.workflowDefinitionId },
      include: { nodes: { orderBy: { seq: 'asc' } } },
    });
    const nextNode = definition!.nodes.find((n) => n.seq > (instance.currentNodeSeq ?? 0));
    if (nextNode) {
      await this.advanceToNode(instanceId, nextNode.seq, definition!.id);
    } else {
      await this.finish(instanceId, 'APPROVED', actor);
    }
    return this.getInstanceOrThrow(instanceId);
  }

  async reject(instanceId: string, actor: ActorContext, comment?: string): Promise<WorkflowInstance> {
    const instance = await this.getInstanceOrThrow(instanceId);
    if (instance.status !== 'IN_REVIEW') {
      throw new ConflictException('当前状态不可驳回');
    }
    const approverRow = await this.prisma.workflowInstanceApprover.findFirst({
      where: {
        workflowInstanceId: instanceId,
        nodeSeq: instance.currentNodeSeq ?? -1,
        accountId: actor.accountId,
        role: { in: ['APPROVER', 'ADDED_APPROVER'] },
        status: 'PENDING',
      },
    });
    if (!approverRow) {
      throw new ForbiddenException('您当前不是该审批节点的待审批人');
    }
    await this.prisma.workflowInstanceApprover.update({
      where: { id: approverRow.id },
      data: { status: 'REJECTED', comment, actedAt: new Date() },
    });
    await this.logAction(instanceId, instance.currentNodeSeq, 'REJECT', actor.accountId, comment);
    await this.finish(instanceId, 'REJECTED', actor);
    await this.auditRecord('REJECT', instanceId, actor, { nodeSeq: instance.currentNodeSeq });
    return this.getInstanceOrThrow(instanceId);
  }

  async withdraw(instanceId: string, actor: ActorContext, comment?: string): Promise<WorkflowInstance> {
    const instance = await this.getInstanceOrThrow(instanceId);
    if (instance.initiatorId !== actor.accountId) {
      throw new ForbiddenException('仅发起人可撤回');
    }
    if (!['SUBMITTED', 'IN_REVIEW'].includes(instance.status)) {
      throw new ConflictException('当前状态不可撤回');
    }
    await this.finish(instanceId, 'WITHDRAWN', actor);
    await this.logAction(instanceId, instance.currentNodeSeq, 'WITHDRAW', actor.accountId, comment);
    await this.auditRecord('WITHDRAW', instanceId, actor, {});
    return this.getInstanceOrThrow(instanceId);
  }

  async reassign(
    instanceId: string,
    toAccountId: string,
    actor: ActorContext,
    comment?: string,
    asAdmin = false,
  ): Promise<WorkflowInstance> {
    const instance = await this.getInstanceOrThrow(instanceId);
    if (asAdmin && instance.status === 'IN_REVIEW') {
      // 管理员干预：审批人离职/停用/不在岗导致单据没人处理时，把当前节点所有待审批人换成指定的人
      const target = await this.prisma.account.findFirst({ where: { id: toAccountId, tenantId: instance.tenantId, status: 'ACTIVE' }, select: { id: true } });
      if (!target) throw new ConflictException('转交对象不存在或已停用');
      const pending = await this.prisma.workflowInstanceApprover.findMany({
        where: { workflowInstanceId: instanceId, nodeSeq: instance.currentNodeSeq ?? -1, role: { in: ['APPROVER', 'ADDED_APPROVER'] }, status: 'PENDING' },
      });
      await this.prisma.$transaction([
        this.prisma.workflowInstanceApprover.updateMany({ where: { id: { in: pending.map((p) => p.id) } }, data: { status: 'REASSIGNED', actedAt: new Date(), comment: comment ?? '管理员重新指定审批人' } }),
        this.prisma.workflowInstanceApprover.create({
          data: { workflowInstanceId: instanceId, nodeSeq: instance.currentNodeSeq ?? 0, accountId: toAccountId, role: 'APPROVER', status: 'PENDING', reassignedFromId: pending[0]?.id },
        }),
      ]);
      await this.logAction(instanceId, instance.currentNodeSeq, 'REASSIGN', actor.accountId, comment ?? '管理员重新指定审批人');
      await this.auditRecord('REASSIGN', instanceId, actor, { toAccountId, byAdmin: true });
      return this.getInstanceOrThrow(instanceId);
    }
    const row = await this.prisma.workflowInstanceApprover.findFirst({
      where: {
        workflowInstanceId: instanceId,
        nodeSeq: instance.currentNodeSeq ?? -1,
        accountId: actor.accountId,
        status: 'PENDING',
      },
    });
    if (!row) {
      throw new ForbiddenException('转交人当前不是该节点待审批人');
    }
    await this.prisma.$transaction([
      this.prisma.workflowInstanceApprover.update({
        where: { id: row.id },
        data: { status: 'REASSIGNED', actedAt: new Date(), comment },
      }),
      this.prisma.workflowInstanceApprover.create({
        data: {
          workflowInstanceId: instanceId,
          nodeSeq: row.nodeSeq,
          accountId: toAccountId,
          role: row.role,
          status: 'PENDING',
          reassignedFromId: row.id,
        },
      }),
    ]);
    await this.logAction(instanceId, instance.currentNodeSeq, 'REASSIGN', actor.accountId, comment);
    await this.auditRecord('REASSIGN', instanceId, actor, { toAccountId });
    return this.getInstanceOrThrow(instanceId);
  }

  async addApprover(instanceId: string, accountId: string, actor: ActorContext, comment?: string): Promise<WorkflowInstance> {
    const instance = await this.getInstanceOrThrow(instanceId);
    if (instance.status !== 'IN_REVIEW') {
      throw new ConflictException('当前状态不可加签');
    }
    await this.prisma.workflowInstanceApprover.create({
      data: {
        workflowInstanceId: instanceId,
        nodeSeq: instance.currentNodeSeq ?? 0,
        accountId,
        role: 'ADDED_APPROVER',
        status: 'PENDING',
      },
    });
    await this.logAction(instanceId, instance.currentNodeSeq, 'ADD_APPROVER', actor.accountId, comment);
    await this.auditRecord('ADD_APPROVER', instanceId, actor, { accountId });
    return this.getInstanceOrThrow(instanceId);
  }

  async cc(instanceId: string, accountIds: string[], actor: ActorContext): Promise<WorkflowInstance> {
    const instance = await this.getInstanceOrThrow(instanceId);
    await this.prisma.workflowInstanceApprover.createMany({
      data: accountIds.map((accountId) => ({
        workflowInstanceId: instanceId,
        nodeSeq: instance.currentNodeSeq ?? 0,
        accountId,
        role: 'CC' as const,
        status: 'NOTIFIED' as const,
      })),
    });
    await this.logAction(instanceId, instance.currentNodeSeq, 'CC', actor.accountId);
    await this.auditRecord('CC', instanceId, actor, { accountIds });
    return this.getInstanceOrThrow(instanceId);
  }

  /** 发起人催办：给当前待审批人的待办上打“被催办”标记（同一单据 1 小时内只能催一次）。 */
  async urge(instanceId: string, actor: ActorContext, comment?: string): Promise<WorkflowInstance> {
    const instance = await this.getInstanceOrThrow(instanceId);
    if (instance.initiatorId !== actor.accountId) throw new ForbiddenException('只有发起人可以催办');
    if (instance.status !== 'IN_REVIEW') throw new ConflictException('这张单据当前不在审批中，不需要催办');
    const last = await this.prisma.workflowActionLog.findFirst({ where: { workflowInstanceId: instanceId, action: 'URGE' }, orderBy: { createdAt: 'desc' } });
    if (last && Date.now() - last.createdAt.getTime() < 3600_000) throw new ConflictException('刚催办过，请 1 小时后再催');
    await this.logAction(instanceId, instance.currentNodeSeq, 'URGE', actor.accountId, comment);
    return instance;
  }

  /** 供 BullMQ 延迟任务或手动接口调用，归档为终态，幂等（已归档直接返回）。 */
  async archive(instanceId: string, actor: ActorContext = SYSTEM_ACTOR): Promise<WorkflowInstance> {
    const instance = await this.getInstanceOrThrow(instanceId);
    if (instance.status === 'ARCHIVED') return instance;
    const updated = await this.prisma.workflowInstance.update({
      where: { id: instanceId },
      data: { status: 'ARCHIVED' },
    });
    await this.logAction(instanceId, instance.currentNodeSeq, 'ARCHIVE', actor.accountId);
    await this.auditRecord('ARCHIVE', instanceId, actor, {});
    return updated;
  }

  private async advanceToNode(instanceId: string, seq: number | null, definitionId: string): Promise<void> {
    if (seq === null) {
      await this.finish(instanceId, 'APPROVED', SYSTEM_ACTOR);
      return;
    }
    const node = await this.prisma.workflowNode.findUnique({
      where: { workflowDefinitionId_seq: { workflowDefinitionId: definitionId, seq } },
    });
    if (!node) {
      await this.finish(instanceId, 'APPROVED', SYSTEM_ACTOR);
      return;
    }

    const inst = await this.prisma.workflowInstance.findUnique({ where: { id: instanceId }, select: { storeId: true } });
    const approverAccountIds = await this.resolveApprovers(this.nodeRoleIds(node), this.nodeAccountIds(node), inst?.storeId);
    if (approverAccountIds.length === 0) {
      // 后面的节点没有可审批的人：自动跳过，免得单据卡死在没人处理的节点上
      const nextNode = await this.prisma.workflowNode.findFirst({ where: { workflowDefinitionId: definitionId, seq: { gt: seq } }, orderBy: { seq: 'asc' } });
      await this.logAction(instanceId, seq, 'APPROVE', 'SYSTEM', `节点「${node.name}」没有可审批的人，系统自动跳过`);
      await this.advanceToNode(instanceId, nextNode?.seq ?? null, definitionId);
      return;
    }
    await this.prisma.$transaction([
      this.prisma.workflowInstance.update({
        where: { id: instanceId },
        data: { status: 'IN_REVIEW', currentNodeSeq: seq },
      }),
      ...approverAccountIds.map((accountId) =>
        this.prisma.workflowInstanceApprover.create({
          data: { workflowInstanceId: instanceId, nodeSeq: seq, accountId, role: 'APPROVER', status: 'PENDING' },
        }),
      ),
    ]);
  }

  /** 节点指定的员工：新数据读 approverAccountIds（可多人），旧数据只有一个 approverAccountId */
  private nodeAccountIds(n: { approverAccountId: string | null; approverAccountIds?: unknown }): string[] {
    const arr = Array.isArray(n.approverAccountIds) ? (n.approverAccountIds as unknown[]).filter((x): x is string => typeof x === 'string') : [];
    return arr.length > 0 ? arr : n.approverAccountId ? [n.approverAccountId] : [];
  }

  /** 节点指定的角色：新数据读 approverRoleIds（可多个），旧数据只有一个 approverRoleId */
  private nodeRoleIds(n: { approverType: 'ROLE' | 'ACCOUNT'; approverRoleId: string | null; approverRoleIds?: unknown }): string[] {
    const arr = Array.isArray(n.approverRoleIds) ? (n.approverRoleIds as unknown[]).filter((x): x is string => typeof x === 'string') : [];
    return arr.length > 0 ? arr : n.approverType === 'ROLE' && n.approverRoleId ? [n.approverRoleId] : [];
  }

  /**
   * 找审批人 = 所有指定角色的成员 + 所有指定的员工（去重，只取在职）。
   * 按角色找时：单据属于哪家店就优先找哪家店的人（所属门店=该店，或角色范围指定该店）；本店没有才找全局/本区域范围的总部人员，再没有才找无门店的总部账号，最后兜底所有持有者。
   */
  private async resolveApprovers(roleIds: string[], approverAccountIds: string[], storeId?: string | null): Promise<string[]> {
    const out = new Set<string>();
    if (approverAccountIds.length > 0) {
      const accs = await this.prisma.account.findMany({ where: { id: { in: approverAccountIds }, status: 'ACTIVE' }, select: { id: true } });
      accs.forEach((a) => out.add(a.id));
    }
    const store = storeId ? await this.prisma.store.findUnique({ where: { id: storeId }, select: { regionId: true } }) : null;
    for (const roleId of roleIds) {
      const assignments = await this.prisma.accountRoleAssignment.findMany({
        where: { roleId, revokedAt: null, account: { status: 'ACTIVE' } },
        select: { accountId: true, scopeType: true, scopeId: true, account: { select: { storeId: true } } },
      });
      let matched = assignments;
      if (storeId) {
        // 1) 本店的人：所属门店就是这家店，或角色范围明确指定了这家店 —— 单据属于哪家店，就走哪家店的审批人
        const local = assignments.filter((a) => a.account.storeId === storeId || (a.scopeType === 'STORE' && a.scopeId === storeId));
        // 2) 没有本店的人：取范围覆盖这家店的总部/区域级人员（全局、本区域）
        const covering = assignments.filter((a) => a.scopeType === 'TENANT' || (a.scopeType === 'REGION' && !!store && a.scopeId === store.regionId));
        // 3) 再没有：不属于任何门店的人（总部账号）；最后才兜底给所有持有该角色的人，避免流程卡死
        const hq = assignments.filter((a) => !a.account.storeId);
        matched = local.length > 0 ? local : covering.length > 0 ? covering : hq.length > 0 ? hq : assignments;
      }
      matched.forEach((a) => out.add(a.accountId));
    }
    return [...out];
  }

  private async finish(
    instanceId: string,
    status: 'APPROVED' | 'REJECTED' | 'WITHDRAWN',
    actor: ActorContext,
  ): Promise<void> {
    await this.prisma.workflowInstance.update({
      where: { id: instanceId },
      data: { status, finishedAt: new Date() },
    });
    if (status === 'APPROVED') {
      const delaySeconds = await this.getArchiveDelaySeconds(actor.tenantId);
      await this.archiveQueue.add('archive', { instanceId }, { delay: delaySeconds * 1000 });
    }
  }

  private async getArchiveDelaySeconds(tenantId?: string | null): Promise<number> {
    const param = await this.prisma.parameter.findFirst({
      where: { tenantId: tenantId ?? undefined, storeId: null, key: 'workflow.archive_delay_seconds' },
    });
    return param ? Number(param.value) : 60;
  }

  private async getInstanceOrThrow(id: string): Promise<WorkflowInstance> {
    const instance = await this.prisma.workflowInstance.findUnique({ where: { id } });
    if (!instance) throw new NotFoundException(`WorkflowInstance ${id} 不存在`);
    return instance;
  }

  private async logAction(
    instanceId: string,
    nodeSeq: number | null | undefined,
    action: WorkflowAction,
    actorId?: string,
    comment?: string,
  ): Promise<void> {
    await this.prisma.workflowActionLog.create({
      data: { workflowInstanceId: instanceId, nodeSeq: nodeSeq ?? null, actorId: actorId ?? 'SYSTEM', action, comment },
    });
  }

  private async auditRecord(
    action: AuditAction,
    instanceId: string,
    actor: ActorContext,
    extra: Record<string, unknown>,
  ): Promise<void> {
    await this.auditLogService.record({
      action,
      entityType: 'WorkflowInstance',
      entityId: instanceId,
      afterData: extra,
      tenantId: actor.tenantId,
      storeId: actor.storeId,
      accountId: actor.accountId,
      ip: actor.ip,
      userAgent: actor.userAgent,
      requestId: actor.requestId,
    });
  }
}
