import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { DataScopeService } from '../../common/scope/data-scope.service';
import { generateBusinessNo } from '../../common/utils/business-no.util';
import { addDays } from '../../common/utils/date.util';
import { runVersionedUpdate } from '../../common/utils/versioned-update.util';
import { CreateCareOutreachPlanDto } from './dto/create-care-outreach-plan.dto';
import { QueryCareOutreachPlanDto } from './dto/query-care-outreach-plan.dto';
import { CompleteCareOutreachTaskDto } from './dto/complete-care-outreach-task.dto';

const includePlan = {
  tasks: { orderBy: { dayOffset: 'asc' as const } },
};

/**
 * 关怀计划：由店长/护理人员手动为已离店的妈妈档案生成（不随RoomOccupancy离店流程自动
 * 触发，见业务规则确认记录"离店后关怀跟踪模块实现中"）。按模板的关怀节点在同一事务里
 * 批量生成CareOutreachTask，scheduledDate = checkedOutAt + dayOffset天，同CarePlanService
 * 生成CarePlanTask的写法一致。
 */
@Injectable()
export class CareOutreachPlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
    private readonly dataScopeService: DataScopeService,
  ) {}

  findMany(query: QueryCareOutreachPlanDto = {}) {
    return this.prisma.careOutreachPlan.findMany({
      where: { tenantId: this.ctx.tenantId, motherProfileId: query.motherProfileId },
      include: includePlan,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneOrThrow(id: string) {
    const plan = await this.prisma.careOutreachPlan.findUnique({ where: { id, tenantId: this.ctx.tenantId }, include: includePlan });
    if (!plan) throw new NotFoundException(`CareOutreachPlan ${id} 不存在`);
    return plan;
  }

  /** 待跟进任务：查询调用方门店范围内 PENDING 状态的关怀任务，不泄露其他门店的客户信息。 */
  async findPendingTasks() {
    const allowed = await this.dataScopeService.resolveAllowedStoreIds(this.ctx);
    return this.prisma.careOutreachTask.findMany({
      where: { tenantId: this.ctx.tenantId, status: 'PENDING', storeId: allowed === 'ALL' ? undefined : { in: allowed } },
      include: { plan: { include: { motherProfile: { include: { customer: true } } } } },
      orderBy: { scheduledDate: 'asc' },
    });
  }

  async create(dto: CreateCareOutreachPlanDto) {
    const template = await this.prisma.careOutreachTemplate.findUnique({ where: { id: dto.templateId }, include: { items: true } });
    if (!template) throw new NotFoundException(`CareOutreachTemplate ${dto.templateId} 不存在`);
    const mother = await this.prisma.motherProfile.findUnique({ where: { id: dto.motherProfileId } });
    if (!mother) throw new NotFoundException(`MotherProfile ${dto.motherProfileId} 不存在`);

    const checkedOutAt = new Date(dto.checkedOutAt);
    const created = await this.prisma.$transaction(async (tx) => {
      const plan = await tx.careOutreachPlan.create({
        data: {
          tenantId: this.ctx.tenantId!,
          storeId: mother.storeId,
          planNo: generateBusinessNo('CO'),
          templateId: dto.templateId,
          motherProfileId: dto.motherProfileId,
          checkedOutAt,
          status: 'ACTIVE',
          createdBy: this.ctx.accountId!,
        },
      });
      await tx.careOutreachTask.createMany({
        data: template.items.map((item) => ({
          tenantId: this.ctx.tenantId!,
          storeId: mother.storeId,
          planId: plan.id,
          dayOffset: item.dayOffset,
          scheduledDate: addDays(checkedOutAt, item.dayOffset),
          title: item.title,
          content: item.content,
        })),
      });
      return plan;
    });

    const withTasks = await this.findOneOrThrow(created.id);
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'CareOutreachPlan',
      entityId: created.id,
      afterData: withTasks,
      ...this.auditCtx(),
    });
    return withTasks;
  }

  async terminate(id: string, reason: string, expectedVersion: number) {
    const before = await this.findOneOrThrow(id);
    await this.dataScopeService.assertStoreAccessible(this.ctx, before.storeId);
    if (before.version !== expectedVersion) {
      throw new ConflictException('数据已被他人修改，请刷新后重试');
    }
    if (before.status !== 'ACTIVE') {
      throw new BadRequestException(`关怀计划当前状态「${before.status}」不允许终止`);
    }
    const updated = await runVersionedUpdate(() => this.prisma.$transaction(async (tx) => {
      const plan = await tx.careOutreachPlan.update({
        where: { id, version: expectedVersion },
        data: { status: 'TERMINATED', terminateReason: reason, version: { increment: 1 } },
      });
      await tx.careOutreachTask.updateMany({
        where: { planId: id, status: 'PENDING' },
        data: { status: 'SKIPPED', completionNote: `计划已终止：${reason}` },
      });
      return plan;
    }));
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'CareOutreachPlan',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: `ACTIVE -> TERMINATED：${reason}`,
      ...this.auditCtx(),
    });
    return this.findOneOrThrow(id);
  }

  /** 完成/跳过关怀任务：简单打卡+备注，不复用结构化临床记录引擎。全部任务处理完毕后计划自动置为COMPLETED。 */
  async completeTask(taskId: string, dto: CompleteCareOutreachTaskDto) {
    const task = await this.prisma.careOutreachTask.findFirst({ where: { id: taskId, tenantId: this.ctx.tenantId } });
    if (!task) throw new NotFoundException(`CareOutreachTask ${taskId} 不存在`);
    await this.dataScopeService.assertStoreAccessible(this.ctx, task.storeId);
    if (task.status !== 'PENDING') {
      throw new BadRequestException(`该关怀任务当前状态「${task.status}」不允许处理`);
    }

    const updatedTask = await this.prisma.careOutreachTask.update({
      where: { id: taskId },
      data: {
        status: dto.status,
        completionNote: dto.completionNote,
        completedById: this.ctx.accountId,
        completedAt: new Date(),
      },
    });

    const remainingPending = await this.prisma.careOutreachTask.count({ where: { planId: task.planId, status: 'PENDING' } });
    if (remainingPending === 0) {
      await this.prisma.careOutreachPlan.update({ where: { id: task.planId }, data: { status: 'COMPLETED' } });
    }

    await this.auditLogService.record({
      action: 'UPDATE',
      entityType: 'CareOutreachTask',
      entityId: taskId,
      beforeData: task,
      afterData: updatedTask,
      changedFields: ['status', 'completionNote'],
      ...this.auditCtx(),
    });
    return updatedTask;
  }

  private auditCtx() {
    return {
      tenantId: this.ctx.tenantId,
      storeId: this.ctx.homeStoreId,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    };
  }
}
