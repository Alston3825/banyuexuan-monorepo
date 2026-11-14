import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { LeaveRequest } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { ActorContext } from '../../common/context/actor-context';
import { runVersionedUpdate } from '../../common/utils/versioned-update.util';
import { WorkflowEngineService } from '../../workflow/workflow-engine/workflow-engine.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { QueryLeaveRequestDto } from './dto/query-leave-request.dto';

const DEFINITION_CODE = 'OFFICE_LEAVE';
const BUSINESS_TYPE = 'LEAVE_REQUEST';
const includeRequest = { employeeProfile: { include: { account: { select: { id: true, realName: true } } } } };

/**
 * 请假申请：DRAFT -(提交)-> PENDING_APPROVAL -(店长单级审批)-> APPROVED/REJECTED。
 * 与 CommissionRecord/PayrollRecord 完全同构的 reconcileStatus() 懒同步模式。
 * 本期不做请假冲突检测/额度扣减，仅登记+审批，呼应HR域"请假管理本期不做"的范围收窄记录。
 */
@Injectable()
export class LeaveRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowEngineService: WorkflowEngineService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  async findMany(query: QueryLeaveRequestDto = {}): Promise<LeaveRequest[]> {
    const requests = await this.prisma.leaveRequest.findMany({
      where: { tenantId: this.ctx.tenantId, storeId: query.storeId, employeeProfileId: query.employeeProfileId, status: query.status },
      include: includeRequest,
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(requests.map((r) => this.reconcileStatus(r)));
  }

  async findOneOrThrow(id: string): Promise<LeaveRequest> {
    const request = await this.prisma.leaveRequest.findUnique({ where: { id }, include: includeRequest });
    if (!request) throw new NotFoundException(`LeaveRequest ${id} 不存在`);
    return this.reconcileStatus(request);
  }

  async create(dto: CreateLeaveRequestDto): Promise<LeaveRequest> {
    const employee = await this.prisma.employeeProfile.findUnique({ where: { id: dto.employeeProfileId } });
    if (!employee) throw new NotFoundException(`EmployeeProfile ${dto.employeeProfileId} 不存在`);
    if (new Date(dto.endDate) < new Date(dto.startDate)) {
      throw new BadRequestException('结束日期不能早于开始日期');
    }

    const created = await this.prisma.leaveRequest.create({
      data: {
        tenantId: this.ctx.tenantId!,
        storeId: dto.storeId,
        employeeProfileId: dto.employeeProfileId,
        leaveType: dto.leaveType,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        reason: dto.reason,
        createdBy: this.ctx.accountId!,
      },
      include: includeRequest,
    });
    await this.auditLogService.record({ action: 'CREATE', entityType: 'LeaveRequest', entityId: created.id, afterData: created, ...this.auditCtx(dto.storeId) });
    return created;
  }

  async submit(id: string, expectedVersion: number): Promise<LeaveRequest> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (before.status !== 'DRAFT') throw new BadRequestException(`请假申请当前状态「${before.status}」不允许提交`);

    await this.workflowEngineService.startInstance(
      { definitionCode: DEFINITION_CODE, businessType: BUSINESS_TYPE, businessId: id, title: `请假申请-${id}`, storeId: before.storeId },
      this.actor(),
    );
    const updated = await runVersionedUpdate(() =>
      this.prisma.leaveRequest.update({ where: { id, version: expectedVersion }, data: { status: 'PENDING_APPROVAL', version: { increment: 1 } }, include: includeRequest }),
    );
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'LeaveRequest',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: 'DRAFT -> PENDING_APPROVAL',
      ...this.auditCtx(before.storeId),
    });
    return updated;
  }

  async cancel(id: string, cancelReason: string, expectedVersion: number): Promise<LeaveRequest> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (!['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(before.status)) {
      throw new BadRequestException(`请假申请当前状态「${before.status}」不允许取消`);
    }
    const updated = await runVersionedUpdate(() =>
      this.prisma.leaveRequest.update({
        where: { id, version: expectedVersion },
        data: { status: 'CANCELLED', cancelReason, version: { increment: 1 } },
        include: includeRequest,
      }),
    );
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'LeaveRequest',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: `${before.status} -> CANCELLED：${cancelReason}`,
      ...this.auditCtx(before.storeId),
    });
    return updated;
  }

  private async reconcileStatus(request: LeaveRequest): Promise<LeaveRequest> {
    if (request.status !== 'PENDING_APPROVAL') return request;
    const instance = await this.prisma.workflowInstance.findFirst({
      where: { businessType: BUSINESS_TYPE, businessId: request.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!instance) return request;

    let nextStatus: 'APPROVED' | 'REJECTED' | 'DRAFT' | null = null;
    if (instance.status === 'APPROVED' || instance.status === 'ARCHIVED') nextStatus = 'APPROVED';
    else if (instance.status === 'REJECTED') nextStatus = 'REJECTED';
    else if (instance.status === 'WITHDRAWN') nextStatus = 'DRAFT';
    if (!nextStatus) return request;

    const updated = await this.prisma.leaveRequest.update({
      where: { id: request.id },
      data: { status: nextStatus, version: { increment: 1 } },
      include: includeRequest,
    });
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'LeaveRequest',
      entityId: request.id,
      beforeData: request,
      afterData: updated,
      remark: `PENDING_APPROVAL -> ${nextStatus}（同步自 WorkflowInstance ${instance.id}）`,
      ...this.auditCtx(request.storeId),
    });
    return updated;
  }

  private assertVersion(before: LeaveRequest, expectedVersion: number): void {
    if (before.version !== expectedVersion) throw new ConflictException('数据已被他人修改，请刷新后重试');
  }

  private actor(): ActorContext {
    return {
      accountId: this.ctx.accountId,
      tenantId: this.ctx.tenantId,
      storeId: this.ctx.homeStoreId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    };
  }

  private auditCtx(storeId: string) {
    return {
      tenantId: this.ctx.tenantId,
      storeId,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    };
  }
}
