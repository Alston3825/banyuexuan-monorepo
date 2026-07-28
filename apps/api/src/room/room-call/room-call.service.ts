import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RoomCall } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { CreateRoomCallDto } from './dto/create-room-call.dto';
import { QueryRoomCallDto } from './dto/query-room-call.dto';

/**
 * 呼叫记录：PENDING -(处理)-> HANDLED，前台日常操作、量大且低风险，不做乐观锁版本号
 * （同 FollowUpRecord/WorkflowActionLog 的"轻量日志类实体"处理口径）。
 */
@Injectable()
export class RoomCallService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  findMany(query: QueryRoomCallDto = {}): Promise<RoomCall[]> {
    return this.prisma.roomCall.findMany({
      where: { tenantId: this.ctx.tenantId, occupancyId: query.occupancyId, storeId: query.storeId, status: query.status },
      orderBy: { calledAt: 'desc' },
    });
  }

  async findOneOrThrow(id: string): Promise<RoomCall> {
    const call = await this.prisma.roomCall.findUnique({ where: { id } });
    if (!call) throw new NotFoundException(`RoomCall ${id} 不存在`);
    return call;
  }

  async create(dto: CreateRoomCallDto): Promise<RoomCall> {
    const occupancy = await this.prisma.roomOccupancy.findUnique({ where: { id: dto.occupancyId } });
    if (!occupancy) throw new NotFoundException(`RoomOccupancy ${dto.occupancyId} 不存在`);
    const created = await this.prisma.roomCall.create({
      data: {
        tenantId: this.ctx.tenantId!,
        storeId: occupancy.storeId,
        occupancyId: dto.occupancyId,
        reason: dto.reason,
        remark: dto.remark,
        createdBy: this.ctx.accountId!,
      },
    });
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'RoomCall',
      entityId: created.id,
      afterData: created,
      ...this.auditCtx(),
    });
    return created;
  }

  async handle(id: string): Promise<RoomCall> {
    const before = await this.findOneOrThrow(id);
    if (before.status !== 'PENDING') {
      throw new BadRequestException(`呼叫记录当前状态「${before.status}」不允许处理`);
    }
    const updated = await this.prisma.roomCall.update({
      where: { id },
      data: { status: 'HANDLED', handledAt: new Date(), handledBy: this.ctx.accountId },
    });
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'RoomCall',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: 'PENDING -> HANDLED',
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
