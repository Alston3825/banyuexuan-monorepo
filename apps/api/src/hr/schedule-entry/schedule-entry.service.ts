import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ScheduleEntry } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { CreateScheduleEntryDto } from './dto/create-schedule-entry.dto';
import { UpdateScheduleEntryDto } from './dto/update-schedule-entry.dto';
import { QueryScheduleEntryDto } from './dto/query-schedule-entry.dto';

const includeEntry = {
  employeeProfile: { include: { account: { select: { id: true, realName: true } } } },
  shiftDefinition: true,
};

/** 排班记录：一名员工一天一条（本期不支持一天拆分多班次），手工登记，不做冲突/自动排班建议。 */
@Injectable()
export class ScheduleEntryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  findMany(query: QueryScheduleEntryDto = {}) {
    return this.prisma.scheduleEntry.findMany({
      where: {
        tenantId: this.ctx.tenantId,
        storeId: query.storeId,
        employeeProfileId: query.employeeProfileId,
        workDate: {
          gte: query.startDate ? new Date(query.startDate) : undefined,
          lte: query.endDate ? new Date(query.endDate) : undefined,
        },
      },
      include: includeEntry,
      orderBy: { workDate: 'asc' },
    });
  }

  async findOneOrThrow(id: string) {
    const entry = await this.prisma.scheduleEntry.findUnique({ where: { id }, include: includeEntry });
    if (!entry) throw new NotFoundException(`ScheduleEntry ${id} 不存在`);
    return entry;
  }

  async create(dto: CreateScheduleEntryDto): Promise<ScheduleEntry> {
    const [employeeProfile, shiftDefinition] = await Promise.all([
      this.prisma.employeeProfile.findUnique({ where: { id: dto.employeeProfileId } }),
      this.prisma.shiftDefinition.findUnique({ where: { id: dto.shiftDefinitionId } }),
    ]);
    if (!employeeProfile) throw new NotFoundException(`EmployeeProfile ${dto.employeeProfileId} 不存在`);
    if (!shiftDefinition) throw new NotFoundException(`ShiftDefinition ${dto.shiftDefinitionId} 不存在`);

    const existing = await this.prisma.scheduleEntry.findUnique({
      where: { employeeProfileId_workDate: { employeeProfileId: dto.employeeProfileId, workDate: new Date(dto.workDate) } },
    });
    if (existing) throw new BadRequestException('该员工当天已有排班记录，请编辑或删除后重新登记');

    const created = await this.prisma.scheduleEntry.create({
      data: {
        tenantId: this.ctx.tenantId!,
        storeId: dto.storeId,
        employeeProfileId: dto.employeeProfileId,
        workDate: new Date(dto.workDate),
        shiftDefinitionId: dto.shiftDefinitionId,
        remark: dto.remark,
        createdBy: this.ctx.accountId!,
      },
      include: includeEntry,
    });
    await this.auditLogService.record({ action: 'CREATE', entityType: 'ScheduleEntry', entityId: created.id, afterData: created, ...this.auditCtx(dto.storeId) });
    return created;
  }

  async update(id: string, dto: UpdateScheduleEntryDto): Promise<ScheduleEntry> {
    const before = await this.findOneOrThrow(id);
    if (before.version !== dto.version) throw new ConflictException('数据已被他人修改，请刷新后重试');
    if (dto.shiftDefinitionId) {
      const shiftDefinition = await this.prisma.shiftDefinition.findUnique({ where: { id: dto.shiftDefinitionId } });
      if (!shiftDefinition) throw new NotFoundException(`ShiftDefinition ${dto.shiftDefinitionId} 不存在`);
    }
    const updated = await this.prisma.scheduleEntry.update({
      where: { id },
      data: { shiftDefinitionId: dto.shiftDefinitionId, remark: dto.remark, version: { increment: 1 } },
      include: includeEntry,
    });
    await this.auditLogService.record({
      action: 'UPDATE',
      entityType: 'ScheduleEntry',
      entityId: id,
      beforeData: before,
      afterData: updated,
      changedFields: ['shiftDefinitionId', 'remark'],
      ...this.auditCtx(before.storeId),
    });
    return updated;
  }

  async delete(id: string): Promise<void> {
    const before = await this.findOneOrThrow(id);
    await this.prisma.scheduleEntry.delete({ where: { id } });
    await this.auditLogService.record({ action: 'DELETE', entityType: 'ScheduleEntry', entityId: id, beforeData: before, ...this.auditCtx(before.storeId) });
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
