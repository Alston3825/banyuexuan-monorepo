import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ServiceAppointment } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { generateBusinessNo } from '../../common/utils/business-no.util';
import { runVersionedUpdate } from '../../common/utils/versioned-update.util';
import { CreateServiceAppointmentDto } from './dto/create-service-appointment.dto';
import { QueryServiceAppointmentDto } from './dto/query-service-appointment.dto';
import { CancelServiceAppointmentDto } from './dto/cancel-service-appointment.dto';
import { FeedbackServiceAppointmentDto } from './dto/feedback-service-appointment.dto';
import { QueryServiceReportDto } from './dto/query-service-report.dto';

const includeAppointment = { product: true, therapist: true, sourcePackage: { include: { package: true } } };

export interface ServiceAppointmentReport {
  totalAppointments: number;
  bookedCount: number;
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  avgRating: number | null;
  byProduct: { productId: string; name: string; completedCount: number }[];
  byTherapist: { therapistId: string; name: string; completedCount: number }[];
}

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

  /**
   * 产康服务基础报表（P2交付物"膳食预算与产康结算的基础报表"）：预约执行情况
   * 与技师业绩统计。本期不做真正的结算/分成计算，只做数量层面的统计。
   */
  async report(query: QueryServiceReportDto = {}): Promise<ServiceAppointmentReport> {
    const appointments = await this.prisma.serviceAppointment.findMany({
      where: {
        tenantId: this.ctx.tenantId,
        storeId: query.storeId,
        scheduledAt: {
          gte: query.startDate ? new Date(query.startDate) : undefined,
          lte: query.endDate ? new Date(query.endDate) : undefined,
        },
      },
      include: { product: true, therapist: true },
    });

    let bookedCount = 0;
    let completedCount = 0;
    let cancelledCount = 0;
    let noShowCount = 0;
    let ratingSum = 0;
    let ratingCount = 0;
    const byProductMap = new Map<string, { name: string; count: number }>();
    const byTherapistMap = new Map<string, { name: string; count: number }>();

    for (const appointment of appointments) {
      if (appointment.rating !== null) {
        ratingSum += appointment.rating;
        ratingCount += 1;
      }
      switch (appointment.status) {
        case 'BOOKED':
          bookedCount += 1;
          break;
        case 'COMPLETED': {
          completedCount += 1;
          const product = byProductMap.get(appointment.productId);
          if (product) product.count += 1;
          else byProductMap.set(appointment.productId, { name: appointment.product.name, count: 1 });
          if (appointment.therapistId && appointment.therapist) {
            const therapist = byTherapistMap.get(appointment.therapistId);
            if (therapist) therapist.count += 1;
            else byTherapistMap.set(appointment.therapistId, { name: appointment.therapist.name, count: 1 });
          }
          break;
        }
        case 'CANCELLED':
          cancelledCount += 1;
          break;
        case 'NO_SHOW':
          noShowCount += 1;
          break;
      }
    }

    return {
      totalAppointments: appointments.length,
      bookedCount,
      completedCount,
      cancelledCount,
      noShowCount,
      avgRating: ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 100) / 100 : null,
      byProduct: [...byProductMap.entries()]
        .map(([productId, v]) => ({ productId, name: v.name, completedCount: v.count }))
        .sort((a, b) => b.completedCount - a.completedCount),
      byTherapist: [...byTherapistMap.entries()]
        .map(([therapistId, v]) => ({ therapistId, name: v.name, completedCount: v.count }))
        .sort((a, b) => b.completedCount - a.completedCount),
    };
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

    const updated = await runVersionedUpdate(() => this.prisma.$transaction(async (tx) => {
      if (before.sourcePackageId) {
        const sourcePackage = await tx.customerServicePackage.findUnique({ where: { id: before.sourcePackageId } });
        if (!sourcePackage || sourcePackage.status !== 'ACTIVE' || sourcePackage.remainingSessions <= 0) {
          throw new BadRequestException('该服务包已用完或已失效，无法消项');
        }
        // 原子 decrement + where 带 remainingSessions 下限：两个并发预约同时消耗同一个只剩
        // 1次的服务包时，字面量写法（读到1、算出0、写回0）会让两次消项都"成功"，实际上
        // 免费多消耗了一次。这里用返回值里的最新 remainingSessions 判断要不要转 EXHAUSTED，
        // 而不是用之前算好的 remaining——因为落库前可能已经被别的并发请求改变。
        let updatedPackage;
        try {
          updatedPackage = await tx.customerServicePackage.update({
            where: { id: sourcePackage.id, remainingSessions: { gt: 0 } },
            data: { remainingSessions: { decrement: 1 }, version: { increment: 1 } },
          });
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
            throw new BadRequestException('该服务包已用完或已失效，无法消项');
          }
          throw err;
        }
        if (updatedPackage.remainingSessions === 0 && updatedPackage.status !== 'EXHAUSTED') {
          await tx.customerServicePackage.update({ where: { id: sourcePackage.id }, data: { status: 'EXHAUSTED' } });
        }
      }
      return tx.serviceAppointment.update({
        where: { id, version: expectedVersion },
        data: { status: 'COMPLETED', completedAt: new Date(), version: { increment: 1 } },
        include: includeAppointment,
      });
    }));

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
