import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RoomServiceRequisition } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { CreateRoomServiceRequisitionDto } from './dto/create-room-service-requisition.dto';
import { QueryRoomServiceRequisitionDto } from './dto/query-room-service-requisition.dto';

/**
 * 客房服务领用：REQUESTED -(领用完成)-> FULFILLED。本期不接库存域（P3才有真实进销存），
 * 不做乐观锁版本号（同 RoomCall 的"轻量日志类实体"处理口径）。
 */
@Injectable()
export class RoomServiceRequisitionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  findMany(query: QueryRoomServiceRequisitionDto = {}): Promise<RoomServiceRequisition[]> {
    return this.prisma.roomServiceRequisition.findMany({
      where: { tenantId: this.ctx.tenantId, occupancyId: query.occupancyId, storeId: query.storeId, status: query.status },
      orderBy: { requestedAt: 'desc' },
    });
  }

  async findOneOrThrow(id: string): Promise<RoomServiceRequisition> {
    const req = await this.prisma.roomServiceRequisition.findUnique({ where: { id } });
    if (!req) throw new NotFoundException(`RoomServiceRequisition ${id} 不存在`);
    return req;
  }

  async create(dto: CreateRoomServiceRequisitionDto): Promise<RoomServiceRequisition> {
    const occupancy = await this.prisma.roomOccupancy.findUnique({ where: { id: dto.occupancyId } });
    if (!occupancy) throw new NotFoundException(`RoomOccupancy ${dto.occupancyId} 不存在`);
    const created = await this.prisma.roomServiceRequisition.create({
      data: {
        tenantId: this.ctx.tenantId!,
        storeId: occupancy.storeId,
        occupancyId: dto.occupancyId,
        itemName: dto.itemName,
        quantity: dto.quantity ?? 1,
        remark: dto.remark,
        createdBy: this.ctx.accountId!,
      },
    });
    await this.auditLogService.record({ action: 'CREATE', entityType: 'RoomServiceRequisition', entityId: created.id, afterData: created, ...this.auditCtx() });
    return created;
  }

  async fulfill(id: string): Promise<RoomServiceRequisition> {
    const before = await this.findOneOrThrow(id);
    if (before.status !== 'REQUESTED') throw new BadRequestException(`领用记录当前状态「${before.status}」不允许标记完成`);
    const updated = await this.prisma.roomServiceRequisition.update({
      where: { id },
      data: { status: 'FULFILLED', fulfilledAt: new Date(), fulfilledBy: this.ctx.accountId },
    });
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'RoomServiceRequisition',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: 'REQUESTED -> FULFILLED',
      ...this.auditCtx(),
    });
    return updated;
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
