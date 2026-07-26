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
      throw new NotFoundException(`工作流定义 ${params.definitionCode} 不存在或未发布`);
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
  ): Promise<WorkflowInstance> {
    const instance = await this.getInstanceOrThrow(instanceId);
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

    const approverAccountIds = await this.resolveApprovers(node.approverType, node.approverRoleId, node.approverAccountId);
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

  private async resolveApprovers(
    approverType: 'ROLE' | 'ACCOUNT',
    approverRoleId: string | null,
    approverAccountId: string | null,
  ): Promise<string[]> {
    if (approverType === 'ACCOUNT' && approverAccountId) return [approverAccountId];
    if (approverType === 'ROLE' && approverRoleId) {
      const assignments = await this.prisma.accountRoleAssignment.findMany({
        where: { roleId: approverRoleId, revokedAt: null },
        select: { accountId: true },
      });
      return Array.from(new Set(assignments.map((a) => a.accountId)));
    }
    return [];
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
