import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MotherProfile } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { runVersionedUpdate } from '../../common/utils/versioned-update.util';
import { CustomerService } from '../../crm/customer/customer.service';
import { CreateMotherProfileDto } from './dto/create-mother-profile.dto';
import { UpdateMotherProfileDto } from './dto/update-mother-profile.dto';
import { QueryMotherProfileDto } from './dto/query-mother-profile.dto';

const includeProfile = {
  babies: { orderBy: { sequenceNo: 'asc' as const } },
};

/**
 * 妈妈档案：一次入住/一次月子周期一条记录（不是与 Customer 一一对应）——"再次入住"
 * 直接新建一条档案，本服务不提供 delete，历史档案永久保留（业务规则确认记录#6）。
 * 风险标签复用平台 Tag/TagBinding（entityType='MOTHER_PROFILE'/'BABY_PROFILE'），
 * 绑定前先校验标签存在，避免建档后才发现标签 ID 无效导致的中间态。
 */
@Injectable()
export class MotherProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerService: CustomerService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  findMany(query: QueryMotherProfileDto = {}) {
    return this.prisma.motherProfile.findMany({
      where: { tenantId: this.ctx.tenantId, customerId: query.customerId, storeId: query.storeId },
      include: includeProfile,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneOrThrow(id: string) {
    const profile = await this.prisma.motherProfile.findUnique({ where: { id }, include: includeProfile });
    if (!profile) throw new NotFoundException(`MotherProfile ${id} 不存在`);
    return profile;
  }

  async getRiskTags(entityType: 'MOTHER_PROFILE' | 'BABY_PROFILE', entityId: string) {
    return this.prisma.tagBinding.findMany({ where: { entityType, entityId }, include: { tag: true } });
  }

  private async assertTagsExist(tagIds: string[]) {
    if (tagIds.length === 0) return;
    const tags = await this.prisma.tag.findMany({ where: { id: { in: tagIds }, tenantId: this.ctx.tenantId } });
    if (tags.length !== new Set(tagIds).size) {
      throw new BadRequestException('存在不存在的标签 ID');
    }
  }

  async create(dto: CreateMotherProfileDto): Promise<MotherProfile> {
    await this.customerService.findOneOrThrow(dto.customerId);
    let storeId = this.ctx.homeStoreId ?? undefined;
    if (dto.occupancyId) {
      const occupancy = await this.prisma.roomOccupancy.findUnique({ where: { id: dto.occupancyId } });
      if (!occupancy) throw new NotFoundException(`RoomOccupancy ${dto.occupancyId} 不存在`);
      if (occupancy.customerId !== dto.customerId) {
        throw new BadRequestException('入住记录与客户不匹配');
      }
      storeId = occupancy.storeId;
    }
    if (!storeId) throw new BadRequestException('无法确定档案所属门店：请提供入住记录或使用有门店归属的账号操作');

    await this.assertTagsExist(dto.riskTagIds ?? []);
    for (const baby of dto.babies ?? []) {
      await this.assertTagsExist(baby.riskTagIds ?? []);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const profile = await tx.motherProfile.create({
        data: {
          tenantId: this.ctx.tenantId!,
          storeId,
          customerId: dto.customerId,
          occupancyId: dto.occupancyId,
          deliveryMethod: dto.deliveryMethod,
          deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : undefined,
          gestationalWeeks: dto.gestationalWeeks,
          expectedDeliveryDate: dto.expectedDeliveryDate ? new Date(dto.expectedDeliveryDate) : undefined,
          remark: dto.remark,
          createdBy: this.ctx.accountId!,
        },
      });
      for (const [index, baby] of (dto.babies ?? []).entries()) {
        const babyProfile = await tx.babyProfile.create({
          data: {
            tenantId: this.ctx.tenantId!,
            storeId,
            customerId: dto.customerId,
            motherProfileId: profile.id,
            sequenceNo: index + 1,
            name: baby.name,
            gender: baby.gender,
            birthDate: baby.birthDate ? new Date(baby.birthDate) : undefined,
            birthWeightGrams: baby.birthWeightGrams,
            apgarScore: baby.apgarScore,
            remark: baby.remark,
            createdBy: this.ctx.accountId!,
          },
        });
        for (const tagId of baby.riskTagIds ?? []) {
          await tx.tagBinding.create({
            data: { tagId, entityType: 'BABY_PROFILE', entityId: babyProfile.id, tenantId: this.ctx.tenantId!, createdBy: this.ctx.accountId! },
          });
        }
      }
      for (const tagId of dto.riskTagIds ?? []) {
        await tx.tagBinding.create({
          data: { tagId, entityType: 'MOTHER_PROFILE', entityId: profile.id, tenantId: this.ctx.tenantId!, createdBy: this.ctx.accountId! },
        });
      }
      return profile;
    });

    const withBabies = await this.findOneOrThrow(created.id);
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'MotherProfile',
      entityId: created.id,
      afterData: withBabies,
      ...this.auditCtx(),
    });
    return withBabies as MotherProfile;
  }

  async update(id: string, dto: UpdateMotherProfileDto): Promise<MotherProfile> {
    const before = await this.findOneOrThrow(id);
    if (before.version !== dto.version) {
      throw new ConflictException('数据已被他人修改，请刷新后重试');
    }
    const updated = await runVersionedUpdate(() =>
      this.prisma.motherProfile.update({
        where: { id, version: dto.version },
        data: {
          occupancyId: dto.occupancyId,
          deliveryMethod: dto.deliveryMethod,
          deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : undefined,
          gestationalWeeks: dto.gestationalWeeks,
          expectedDeliveryDate: dto.expectedDeliveryDate ? new Date(dto.expectedDeliveryDate) : undefined,
          remark: dto.remark,
          version: { increment: 1 },
        },
      }),
    );
    await this.auditLogService.record({
      action: 'UPDATE',
      entityType: 'MotherProfile',
      entityId: id,
      beforeData: before,
      afterData: updated,
      changedFields: Object.keys(dto).filter((k) => k !== 'version'),
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
