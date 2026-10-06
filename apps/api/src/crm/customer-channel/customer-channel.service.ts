import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomerChannel, CustomerChannelType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { BaseScopedCrudService } from '../../common/base/base-scoped-crud.service';
import {
  CreateChannelTypeDto,
  CreateCustomerChannelDto,
  QueryCustomerChannelDto,
  UpdateChannelTypeDto,
  UpdateCustomerChannelDto,
} from './dto/customer-channel.dto';

/**
 * 具体渠道资料：渠道类型（可自定义，见 CustomerChannelTypeService）下面的具体渠道
 * （如 线上广告 > 小红书）。可新增/改名/停用；从没被任何客户用过的才允许删除。
 */
@Injectable()
export class CustomerChannelService extends BaseScopedCrudService<CustomerChannel> {
  protected readonly entityType = 'CustomerChannel';

  constructor(
    private readonly prisma: PrismaService,
    auditLogService: AuditLogService,
    ctx: RequestContextService,
  ) {
    super(auditLogService, ctx);
  }

  protected get delegate() {
    return this.prisma.customerChannel;
  }

  /** 列表附带"有多少客户在用"，管理页展示用。 */
  async list(query: QueryCustomerChannelDto) {
    const channels = await this.prisma.customerChannel.findMany({
      where: { tenantId: this.ctx.tenantId, typeId: query.typeId, status: query.status },
      orderBy: [{ type: { sortOrder: 'asc' } }, { createdAt: 'asc' }],
      include: { _count: { select: { customers: true } } },
    });
    return channels.map(({ _count, ...c }) => ({ ...c, customerCount: _count.customers }));
  }

  async createChannel(dto: CreateCustomerChannelDto): Promise<CustomerChannel> {
    const type = await this.prisma.customerChannelType.findFirst({ where: { id: dto.typeId, tenantId: this.ctx.tenantId } });
    if (!type) throw new BadRequestException('所选渠道类型不存在');
    try {
      return await super.create({ typeId: dto.typeId, name: dto.name.trim(), tenantId: this.ctx.tenantId });
    } catch (err) {
      throw this.translateDuplicate(err);
    }
  }

  async updateChannel(id: string, dto: UpdateCustomerChannelDto): Promise<CustomerChannel> {
    await this.assertOwn(id);
    const { version, ...data } = dto;
    try {
      return await super.update(id, { ...data, ...(data.name ? { name: data.name.trim() } : {}) }, version);
    } catch (err) {
      throw this.translateDuplicate(err);
    }
  }

  async removeChannel(id: string): Promise<void> {
    await this.assertOwn(id);
    const used = await this.prisma.customer.count({ where: { channelId: id } });
    if (used > 0) throw new ConflictException(`已有 ${used} 位客户选了这个渠道，不能删除；可以改成“停用”`);
    await super.delete(id);
  }

  private async assertOwn(id: string): Promise<void> {
    const found = await this.prisma.customerChannel.findFirst({ where: { id, tenantId: this.ctx.tenantId }, select: { id: true } });
    if (!found) throw new NotFoundException('渠道不存在');
  }

  private translateDuplicate(err: unknown): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new ConflictException('该渠道类型下已有同名渠道');
    }
    return err;
  }
}

/**
 * 渠道类型：系统自带 6 个内置类型（自然到店/转介绍/线上广告/社交媒体私域/渠道合作/其他），
 * 用户可以改名、停用、排序，也可以新增自己的类型。内置类型不能删除（线索转客户等地方靠它们换算）；
 * 自定义类型下面没有具体渠道、也没有客户用过时才能删除。
 */
@Injectable()
export class CustomerChannelTypeService extends BaseScopedCrudService<CustomerChannelType> {
  protected readonly entityType = 'CustomerChannelType';

  constructor(
    private readonly prisma: PrismaService,
    auditLogService: AuditLogService,
    ctx: RequestContextService,
  ) {
    super(auditLogService, ctx);
  }

  protected get delegate() {
    return this.prisma.customerChannelType;
  }

  async list() {
    const types = await this.prisma.customerChannelType.findMany({
      where: { tenantId: this.ctx.tenantId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { channels: true, customers: true } } },
    });
    return types.map(({ _count, ...t }) => ({ ...t, channelCount: _count.channels, customerCount: _count.customers }));
  }

  async createType(dto: CreateChannelTypeDto): Promise<CustomerChannelType> {
    const max = await this.prisma.customerChannelType.aggregate({ where: { tenantId: this.ctx.tenantId }, _max: { sortOrder: true } });
    try {
      return await super.create({ name: dto.name.trim(), sortOrder: (max._max.sortOrder ?? 0) + 1, tenantId: this.ctx.tenantId });
    } catch (err) {
      throw this.translateDuplicate(err);
    }
  }

  async updateType(id: string, dto: UpdateChannelTypeDto): Promise<CustomerChannelType> {
    await this.assertOwn(id);
    const { version, ...data } = dto;
    try {
      return await super.update(id, { ...data, ...(data.name ? { name: data.name.trim() } : {}) }, version);
    } catch (err) {
      throw this.translateDuplicate(err);
    }
  }

  async removeType(id: string): Promise<void> {
    const type = await this.assertOwn(id);
    if (type.legacySource) throw new ConflictException('系统内置的渠道类型不能删除，可以改名或停用');
    const [channels, customers] = await Promise.all([
      this.prisma.customerChannel.count({ where: { typeId: id } }),
      this.prisma.customer.count({ where: { channelTypeId: id } }),
    ]);
    if (channels > 0) throw new ConflictException(`该类型下还有 ${channels} 个具体渠道，请先删除或移走它们`);
    if (customers > 0) throw new ConflictException(`已有 ${customers} 位客户选了这个类型，不能删除；可以改成“停用”`);
    await super.delete(id);
  }

  private async assertOwn(id: string): Promise<CustomerChannelType> {
    const found = await this.prisma.customerChannelType.findFirst({ where: { id, tenantId: this.ctx.tenantId } });
    if (!found) throw new NotFoundException('渠道类型不存在');
    return found;
  }

  private translateDuplicate(err: unknown): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new ConflictException('已有同名的渠道类型');
    }
    return err;
  }
}
