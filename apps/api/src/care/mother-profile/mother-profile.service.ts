import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MotherProfile } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { replaceRiskTags } from '../risk-tag.util';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { runVersionedUpdate } from '../../common/utils/versioned-update.util';
import { CustomerService } from '../../crm/customer/customer.service';
import { CreateMotherProfileDto } from './dto/create-mother-profile.dto';
import { UpdateMotherProfileDto } from './dto/update-mother-profile.dto';
import { QueryMotherProfileDto } from './dto/query-mother-profile.dto';

const includeProfile = {
  babies: { orderBy: { sequenceNo: 'asc' as const } },
  primaryNurse: { select: { id: true, realName: true } },
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
      include: {
        ...includeProfile,
        // 列表要显示"房号 + 客户姓名"，工作人员一眼认出要找的人
        customer: { select: { name: true, phone: true } },
        occupancy: { select: { occupancyNo: true, status: true, room: { select: { roomNo: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneOrThrow(id: string) {
    const profile = await this.prisma.motherProfile.findUnique({ where: { id }, include: includeProfile });
    if (!profile) throw new NotFoundException(`MotherProfile ${id} 不存在`);
    return profile;
  }

  /** 指派护理师时的候选人：本门店（或不限门店）的在职账号；职位/角色/部门里带“护理”的排前面。 */
  async nurseOptions(storeId?: string) {
    const accounts = await this.prisma.account.findMany({
      where: {
        tenantId: this.ctx.tenantId,
        status: 'ACTIVE',
        ...(storeId ? { OR: [{ storeId }, { storeId: null }] } : {}),
      },
      select: {
        id: true,
        realName: true,
        position: { select: { name: true } },
        department: { select: { name: true } },
        roleAssignments: { select: { role: { select: { name: true } } } },
      },
      orderBy: { realName: 'asc' },
    });
    return accounts
      .map((a) => {
        const labels = [a.position?.name, ...a.roleAssignments.map((r) => r.role.name)].filter((x): x is string => !!x);
        const isNurse = [...labels, a.department?.name ?? ''].some((x) => x.includes('护理') || x.includes('护士') || x.includes('月嫂'));
        return { id: a.id, name: a.realName, roles: [...new Set(labels)], isNurse };
      })
      .sort((x, y) => Number(y.isNurse) - Number(x.isNurse));
  }

  private async assertNurse(id: string | null | undefined) {
    if (!id) return;
    const acc = await this.prisma.account.findFirst({ where: { id, tenantId: this.ctx.tenantId, status: 'ACTIVE' }, select: { id: true } });
    if (!acc) throw new BadRequestException('所选护理师不存在或已停用');
  }

  async getRiskTags(entityType: 'MOTHER_PROFILE' | 'BABY_PROFILE', entityId: string) {
    return this.prisma.tagBinding.findMany({ where: { entityType, entityId, revokedAt: null }, include: { tag: true } });
  }

  /** 编辑母婴档案的风险标签（整体替换；只允许母婴风险分类的标签，误选的客户分类/类型会被撤掉）。 */
  async setRiskTags(id: string, tagIds: string[]) {
    await this.findOneOrThrow(id);
    const r = await replaceRiskTags(this.prisma, { tenantId: this.ctx.tenantId!, accountId: this.ctx.accountId!, entityType: 'MOTHER_PROFILE', entityId: id, tagIds });
    await this.auditLogService.record({
      action: 'UPDATE',
      entityType: 'MotherProfile',
      entityId: id,
      remark: `修改风险标签：新增 ${r.added.length} 个，撤销 ${r.removed.length} 个`,
      tenantId: this.ctx.tenantId,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    });
    return this.getRiskTags('MOTHER_PROFILE', id);
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
    await this.assertNurse(dto.primaryNurseId);

    // 没手动选入住记录时，自动关联这位客户当前的入住（已入住优先，其次预订中，且还没被别的档案占用）
    let occupancyId = dto.occupancyId;
    if (!occupancyId) {
      const candidates = await this.prisma.roomOccupancy.findMany({
        where: { tenantId: this.ctx.tenantId, customerId: dto.customerId, status: { in: ['CHECKED_IN', 'RESERVED'] } },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], // CHECKED_IN 排在 RESERVED 前
      });
      for (const c of candidates) {
        if ((await this.prisma.motherProfile.count({ where: { occupancyId: c.id } })) === 0) {
          occupancyId = c.id;
          storeId = c.storeId;
          break;
        }
      }
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const profile = await tx.motherProfile.create({
        data: {
          tenantId: this.ctx.tenantId!,
          storeId,
          customerId: dto.customerId,
          occupancyId,
          deliveryMethod: dto.deliveryMethod,
          deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : undefined,
          gestationalWeeks: dto.gestationalWeeks,
          expectedDeliveryDate: dto.expectedDeliveryDate ? new Date(dto.expectedDeliveryDate) : undefined,
          careNote: dto.careNote,
          primaryNurseId: dto.primaryNurseId,
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
    await this.assertNurse(dto.primaryNurseId);
    const updated = await runVersionedUpdate(() =>
      this.prisma.motherProfile.update({
        where: { id, version: dto.version },
        data: {
          occupancyId: dto.occupancyId,
          deliveryMethod: dto.deliveryMethod,
          deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : undefined,
          gestationalWeeks: dto.gestationalWeeks,
          expectedDeliveryDate: dto.expectedDeliveryDate ? new Date(dto.expectedDeliveryDate) : undefined,
          careNote: dto.careNote,
          primaryNurseId: dto.primaryNurseId,
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
