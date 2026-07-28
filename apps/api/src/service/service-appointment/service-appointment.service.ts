import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ServiceAppointment } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { generateBusinessNo } from '../../common/utils/business-no.util';
import { CreateServiceAppointmentDto } from './dto/create-service-appointment.dto';
import { QueryServiceAppointmentDto } from './dto/query-service-appointment.dto';
import { CancelServiceAppointmentDto } from './dto/cancel-service-appointment.dto';
import { FeedbackServiceAppointmentDto } from './dto/feedback-service-appointment.dto';

const includeAppointment = { product: true, therapist: true, sourcePackage: { include: { package: true } } };

/**
 * 预约：BOOKED -(完成)-> COMPLETED（若来自服务包则消耗额度）；BOOKED -(取消/爽约)-> CANCELLED/NO_SHOW。
 * 完成即视为执行+消项，本期不拆独立的执行记录表（同 schema 里 ServiceAppointment 模型的注释）。
 */
@Injectable()
export class ServiceAppointmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  findMany(query: QueryServiceAppointmentDto = {}) {
    return this.prisma.serviceAppointment.findMany({
      where: {
        tenantId: this.ctx.tenantId,
        customerId: query.customerId,
        therapistId: query.therapistId,
        storeId: query.storeId,
        status: query.status,
      },
      include: includeAppointment,
      orderBy: { scheduledAt: 'desc' },
    });
  }

  async findOneOrThrow(id: string) {
    const appointment = await this.prisma.serviceAppointment.findUnique({ where: { id }, include: includeAppointment });
    if (!appointment) throw new NotFoundException(`ServiceAppointment ${id} 不存在`);
    return appointment;
  }

  async create(dto: CreateServiceAppointmentDto): Promise<ServiceAppointment> {
    const [customer, product] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: dto.customerId } }),
      this.prisma.serviceProduct.findUnique({ where: { id: dto.productId } }),
    ]);
    if (!customer) throw new NotFoundException(`Customer ${dto.customerId} 不存在`);
    if (!product) throw new NotFoundException(`ServiceProduct ${dto.productId} 不存在`);

    if (dto.sourcePackageId) {
      const sourcePackage = await this.prisma.customerServicePackage.findUnique({ where: { id: dto.sourcePackageId } });
      if (!sourcePackage) throw new NotFoundException(`CustomerServicePackage ${dto.sourcePackageId} 不存在`);
      if (sourcePackage.customerId !== dto.customerId) throw new BadRequestException('服务包不属于该客户');
      if (sourcePackage.status !== 'ACTIVE' || sourcePackage.remainingSessions <= 0) {
        throw new BadRequestException('该服务包已用完或已失效，无法预约');
      }
    }

    const created = await this.prisma.serviceAppointment.create({
      data: {
        tenantId: this.ctx.tenantId!,
        storeId: dto.storeId,
        appointmentNo: generateBusinessNo('SA'),
        customerId: dto.customerId,
        productId: dto.productId,
        therapistId: dto.therapistId,
        sourcePackageId: dto.sourcePackageId,
        scheduledAt: new Date(dto.scheduledAt),
        durationMinutes: dto.durationMinutes,
        createdBy: this.ctx.accountId!,
      },
      include: includeAppointment,
    });
    await this.auditLogService.record({ action: 'CREATE', entityType: 'ServiceAppointment', entityId: created.id, afterData: created, ...this.auditCtx(dto.storeId) });
    return created;
  }

  async complete(id: string, expectedVersion: number): Promise<ServiceAppointment> {
    const before = await this.findOneOrThrow(id);
    if (before.version !== expectedVersion) throw new ConflictException('数据已被他人修改，请刷新后重试');
    if (before.status !== 'BOOKED') throw new BadRequestException(`预约当前状态「${before.status}」不允许完成`);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (before.sourcePackageId) {
        const sourcePackage = await tx.customerServicePackage.findUnique({ where: { id: before.sourcePackageId } });
        if (!sourcePackage || sourcePackage.status !== 'ACTIVE' || sourcePackage.remainingSessions <= 0) {
          throw new BadRequestException('该服务包已用完或已失效，无法消项');
        }
        const remaining = sourcePackage.remainingSessions - 1;
        await tx.customerServicePackage.update({
          where: { id: sourcePackage.id },
          data: { remainingSessions: remaining, status: remaining === 0 ? 'EXHAUSTED' : 'ACTIVE', version: { increment: 1 } },
        });
      }
      return tx.serviceAppointment.update({
        where: { id },
        data: { status: 'COMPLETED', completedAt: new Date(), version: { increment: 1 } },
        include: includeAppointment,
      });
    });

    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'ServiceAppointment',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: 'BOOKED -> COMPLETED' + (before.sourcePackageId ? '（消耗服务包1次）' : ''),
      ...this.auditCtx(before.storeId),
    });
    return updated;
  }

  async cancel(id: string, dto: CancelServiceAppointmentDto): Promise<ServiceAppointment> {
    const before = await this.findOneOrThrow(id);
    if (before.version !== dto.version) throw new ConflictException('数据已被他人修改，请刷新后重试');
    if (before.status !== 'BOOKED') throw new BadRequestException(`预约当前状态「${before.status}」不允许取消`);
    const status = dto.noShow ? 'NO_SHOW' : 'CANCELLED';
    const updated = await this.prisma.serviceAppointment.update({
      where: { id },
      data: { status, cancelReason: dto.cancelReason, version: { increment: 1 } },
      include: includeAppointment,
    });
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'ServiceAppointment',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: `BOOKED -> ${status}：${dto.cancelReason}`,
      ...this.auditCtx(before.storeId),
    });
    return updated;
  }

  async feedback(id: string, dto: FeedbackServiceAppointmentDto): Promise<ServiceAppointment> {
    const before = await this.findOneOrThrow(id);
    if (before.status !== 'COMPLETED') throw new BadRequestException('只能对已完成的预约评价');
    const updated = await this.prisma.serviceAppointment.update({
      where: { id },
      data: { rating: dto.rating, comment: dto.comment, version: { increment: 1 } },
      include: includeAppointment,
    });
    await this.auditLogService.record({
      action: 'UPDATE',
      entityType: 'ServiceAppointment',
      entityId: id,
      beforeData: before,
      afterData: updated,
      changedFields: ['rating', 'comment'],
      ...this.auditCtx(before.storeId),
    });
    return updated;
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
