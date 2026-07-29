import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PayrollRecord } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { ActorContext } from '../../common/context/actor-context';
import { WorkflowEngineService } from '../../workflow/workflow-engine/workflow-engine.service';
import { CreatePayrollRecordDto } from './dto/create-payroll-record.dto';
import { QueryPayrollRecordDto } from './dto/query-payroll-record.dto';

const DEFINITION_CODE = 'HR_PAYROLL';
const BUSINESS_TYPE = 'PAYROLL_RECORD';
const includeRecord = { employeeProfile: { include: { account: { select: { id: true, realName: true } } } } };

function parsePeriodRange(period: string): { start: Date; end: Date } {
  const [year, month] = period.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1));
  return { start, end };
}

/**
 * 薪资单：DRAFT -(提交)-> PENDING_APPROVAL -(2级审批：店长初审->超管终审)-> APPROVED
 * -(标记发放)-> PAID。commissionTotal 是创建时对该员工当期(period对应自然月)已批准
 * CommissionAllocation 的快照汇总，之后提成再变化不会回溯影响已生成的薪资单。
 * PENDING_APPROVAL 的推进由 reconcileStatus() 懒同步自 WorkflowInstance，与
 * ContractRecordService/库存各单据/CommissionRecordService 完全同构。
 */
@Injectable()
export class PayrollRecordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowEngineService: WorkflowEngineService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  async findMany(query: QueryPayrollRecordDto = {}): Promise<PayrollRecord[]> {
    const records = await this.prisma.payrollRecord.findMany({
      where: { tenantId: this.ctx.tenantId, storeId: query.storeId, employeeProfileId: query.employeeProfileId, period: query.period, status: query.status },
      include: includeRecord,
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(records.map((r) => this.reconcileStatus(r)));
  }

  async findOneOrThrow(id: string): Promise<PayrollRecord> {
    const record = await this.prisma.payrollRecord.findUnique({ where: { id }, include: includeRecord });
    if (!record) throw new NotFoundException(`PayrollRecord ${id} 不存在`);
    return this.reconcileStatus(record);
  }

  async create(dto: CreatePayrollRecordDto): Promise<PayrollRecord> {
    const employeeProfile = await this.prisma.employeeProfile.findUnique({ where: { id: dto.employeeProfileId } });
    if (!employeeProfile) throw new NotFoundException(`EmployeeProfile ${dto.employeeProfileId} 不存在`);
    const existing = await this.prisma.payrollRecord.findUnique({
      where: { tenantId_employeeProfileId_period: { tenantId: this.ctx.tenantId!, employeeProfileId: dto.employeeProfileId, period: dto.period } },
    });
    if (existing) throw new BadRequestException(`该员工 ${dto.period} 期的薪资单已存在`);

    const { start, end } = parsePeriodRange(dto.period);
    const approvedAllocations = await this.prisma.commissionAllocation.findMany({
      where: {
        employeeProfileId: dto.employeeProfileId,
        commissionRecord: { status: 'APPROVED', createdAt: { gte: start, lt: end } },
      },
    });
    const commissionTotal = approvedAllocations.reduce((sum, a) => sum + a.amount, 0);
    const deductions = dto.deductions ?? 0;
    const netAmount = dto.baseSalary + commissionTotal - deductions;

    const created = await this.prisma.payrollRecord.create({
      data: {
        tenantId: this.ctx.tenantId!,
        storeId: dto.storeId,
        employeeProfileId: dto.employeeProfileId,
        period: dto.period,
        baseSalary: dto.baseSalary,
        commissionTotal,
        deductions,
        netAmount,
        remark: dto.remark,
        createdBy: this.ctx.accountId!,
      },
      include: includeRecord,
    });
    await this.auditLogService.record({ action: 'CREATE', entityType: 'PayrollRecord', entityId: created.id, afterData: created, ...this.auditCtx(dto.storeId) });
    return created;
  }

  async submit(id: string, expectedVersion: number): Promise<PayrollRecord> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (before.status !== 'DRAFT') throw new BadRequestException(`薪资单当前状态「${before.status}」不允许提交`);

    await this.workflowEngineService.startInstance(
      { definitionCode: DEFINITION_CODE, businessType: BUSINESS_TYPE, businessId: id, title: `薪资单-${before.period}`, storeId: before.storeId },
      this.actor(),
    );
    const updated = await this.prisma.payrollRecord.update({ where: { id }, data: { status: 'PENDING_APPROVAL', version: { increment: 1 } }, include: includeRecord });
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'PayrollRecord',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: 'DRAFT -> PENDING_APPROVAL',
      ...this.auditCtx(before.storeId),
    });
    return updated;
  }

  async markPaid(id: string, expectedVersion: number): Promise<PayrollRecord> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (before.status !== 'APPROVED') throw new BadRequestException(`薪资单当前状态「${before.status}」不允许标记发放`);
    const updated = await this.prisma.payrollRecord.update({
      where: { id },
      data: { status: 'PAID', paidAt: new Date(), version: { increment: 1 } },
      include: includeRecord,
    });
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'PayrollRecord',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: 'APPROVED -> PAID',
      ...this.auditCtx(before.storeId),
    });
    return updated;
  }

  async cancel(id: string, cancelReason: string, expectedVersion: number): Promise<PayrollRecord> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (!['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(before.status)) {
      throw new BadRequestException(`薪资单当前状态「${before.status}」不允许取消`);
    }
    const updated = await this.prisma.payrollRecord.update({
      where: { id },
      data: { status: 'CANCELLED', cancelReason, version: { increment: 1 } },
      include: includeRecord,
    });
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'PayrollRecord',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: `${before.status} -> CANCELLED：${cancelReason}`,
      ...this.auditCtx(before.storeId),
    });
    return updated;
  }

  private async reconcileStatus(record: PayrollRecord): Promise<PayrollRecord> {
    if (record.status !== 'PENDING_APPROVAL') return record;
    const instance = await this.prisma.workflowInstance.findFirst({
      where: { businessType: BUSINESS_TYPE, businessId: record.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!instance) return record;

    let nextStatus: 'APPROVED' | 'REJECTED' | 'DRAFT' | null = null;
    if (instance.status === 'APPROVED' || instance.status === 'ARCHIVED') nextStatus = 'APPROVED';
    else if (instance.status === 'REJECTED') nextStatus = 'REJECTED';
    else if (instance.status === 'WITHDRAWN') nextStatus = 'DRAFT';
    if (!nextStatus) return record;

    const updated = await this.prisma.payrollRecord.update({
      where: { id: record.id },
      data: { status: nextStatus, version: { increment: 1 } },
      include: includeRecord,
    });
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'PayrollRecord',
      entityId: record.id,
      beforeData: record,
      afterData: updated,
      remark: `PENDING_APPROVAL -> ${nextStatus}（同步自 WorkflowInstance ${instance.id}）`,
      ...this.auditCtx(record.storeId),
    });
    return updated;
  }

  private assertVersion(before: PayrollRecord, expectedVersion: number): void {
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
