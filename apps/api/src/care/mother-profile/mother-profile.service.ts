import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MotherProfile } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { replaceRiskTags } from '../risk-tag.util';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { runVersionedUpdate } from '../../common/utils/versioned-update.util';
import { CustomerService } from '../../crm/customer/customer.service';
import { CareStorageService } from '../care-document/care-storage.service';
import { addProfileExtras, motherProfilesDeleteCheck } from '../profile-delete.util';
import { RecycleBinService } from '../../common/recycle/recycle-bin.service';
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
    private readonly storage: CareStorageService,
    private readonly recycleBin: RecycleBinService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  findMany(query: QueryMotherProfileDto = {}) {
    return this.prisma.motherProfile.findMany({
      where: {
        tenantId: this.ctx.tenantId,
        customerId: query.customerId,
        storeId: query.storeId,
        // 已归档的默认不显示；archived=only 只看已归档，archived=all 全部
        ...(query.archived === 'only' ? { archivedAt: { not: null } } : query.archived === 'all' ? {} : { archivedAt: null }),
      },
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

  /** 删除前的检查：有哪些数据挂在这份档案下面，能不能删，当前账号有没有“连数据一起删”的权限。 */
  async getDeleteCheck(id: string) {
    const p = await this.findOneOrThrow(id);
    if (p.tenantId !== this.ctx.tenantId) throw new NotFoundException(`MotherProfile ${id} 不存在`);
    const customer = await this.prisma.customer.findUnique({ where: { id: p.customerId }, select: { name: true } });
    const check = await motherProfilesDeleteCheck(this.prisma, [id]);
    return {
      profileId: id,
      customerName: customer?.name ?? '',
      blockers: check.blockers,
      attached: [...(check.babyCount ? [`${check.babyCount} 个宝宝档案`] : []), ...check.attached],
      canForceDelete: await this.ctx.hasPermission('care.profile.force-delete'),
      archived: !!p.archivedAt,
    };
  }

  /**
   * 删除建错的母婴档案：有护理记录/计划/异常等护理痕迹的任何人都不能删（只能归档）；
   * 只挂着宝宝档案、评估表、纸质资料的，需要管理员权限（care.profile.force-delete）并输入客户姓名确认，连同这些一起永久删除；
   * 什么都没有的，care.profile.update 即可直接删。
   */
  async remove(id: string, force = false, confirmName?: string): Promise<void> {
    const check = await this.getDeleteCheck(id);
    const before = await this.findOneOrThrow(id);
    // 护理痕迹：普通人不能删，只有超级管理员（crm.customer.force-delete）带 force 才能连同删
    const superAdmin = await this.ctx.hasPermission('crm.customer.force-delete');
    if (check.blockers.length > 0 && !(force && superAdmin)) {
      throw new ConflictException(`该档案已有${check.blockers.join('、')}，属于护理痕迹，不能删除；不再使用请点“归档”`);
    }
    if (check.attached.length > 0 || check.blockers.length > 0) {
      if (!force) throw new ConflictException(`该档案名下已有${check.attached.join('、')}，直接删除会丢失这些数据；需要管理员确认后连同它们一起删除`);
      if (!check.canForceDelete) throw new ForbiddenException('该档案名下已有宝宝/评估表/纸质资料，连同删除需要管理员权限，请联系管理员');
      // （先验权限再验名字，没权限的人不用被要求输入名字）
      if (confirmName?.trim() !== check.customerName) throw new BadRequestException(`请输入客户姓名「${check.customerName}」确认删除`);
    }
    // 进回收站（保留30天可还原），纸质资料文件到期清除时才真正删除
    await this.recycleBin.deleteToBin({
      entityType: 'MOTHER_PROFILE',
      rootTable: 'mother_profiles',
      rootId: id,
      title: `${check.customerName} 的母婴档案`,
      addExtras: addProfileExtras,
    });
    await this.auditLogService.record({
      action: 'DELETE',
      entityType: 'MotherProfile',
      entityId: id,
      beforeData: before,
      remark: check.attached.length > 0 ? `管理员连同 ${check.attached.join('、')} 一起删除母婴档案（客户：${check.customerName}）` : `删除母婴档案（客户：${check.customerName}）`,
      ...this.auditCtx(),
    });
  }

  /** 归档（结案）：用过的档案不删，列表默认隐藏，可恢复。 */
  async archive(id: string): Promise<void> {
    const before = await this.findOneOrThrow(id);
    if (before.archivedAt) throw new ConflictException('这份档案已经归档了');
    await this.prisma.motherProfile.update({ where: { id }, data: { archivedAt: new Date(), archivedBy: this.ctx.accountId, version: { increment: 1 } } });
    await this.auditLogService.record({ action: 'UPDATE', entityType: 'MotherProfile', entityId: id, remark: '归档母婴档案', ...this.auditCtx() });
  }

  async restore(id: string): Promise<void> {
    const before = await this.findOneOrThrow(id);
    if (!before.archivedAt) throw new ConflictException('这份档案没有归档');
    await this.prisma.motherProfile.update({ where: { id }, data: { archivedAt: null, archivedBy: null, version: { increment: 1 } } });
    await this.auditLogService.record({ action: 'UPDATE', entityType: 'MotherProfile', entityId: id, remark: '恢复已归档的母婴档案', ...this.auditCtx() });
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
    await this.customerService.assertActive(dto.customerId);
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
          allergens: dto.allergens !== undefined ? dto.allergens.trim() || null : (await tx.customer.findUnique({ where: { id: dto.customerId }, select: { allergens: true } }))?.allergens ?? null,
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
            allergens: baby.allergens?.trim() || null,
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
          allergens: dto.allergens === undefined ? undefined : dto.allergens.trim() || null,
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
