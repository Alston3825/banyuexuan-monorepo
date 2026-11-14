import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BabyProfile } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { replaceRiskTags } from '../risk-tag.util';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { runVersionedUpdate } from '../../common/utils/versioned-update.util';
import { CareStorageService } from '../care-document/care-storage.service';
import { CreateBabyProfileDto } from './dto/create-baby-profile.dto';
import { UpdateBabyProfileDto } from './dto/update-baby-profile.dto';
import { QueryBabyProfileDto } from './dto/query-baby-profile.dto';

/**
 * 宝宝档案：补建接口，用于给已存在的妈妈档案追加一条宝宝档案（标准建档路径见
 * MotherProfileService.create 里的嵌套 babies[]）。sequenceNo 按同一妈妈档案下现有
 * 最大值 +1 自动分配，供多胞胎区分（业务规则确认记录#6）。
 */
@Injectable()
export class BabyProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
    private readonly storage: CareStorageService,
  ) {}

  findMany(query: QueryBabyProfileDto = {}): Promise<BabyProfile[]> {
    return this.prisma.babyProfile.findMany({
      where: { tenantId: this.ctx.tenantId, motherProfileId: query.motherProfileId, customerId: query.customerId },
      orderBy: [{ motherProfileId: 'asc' }, { sequenceNo: 'asc' }],
    });
  }

  getRiskTags(id: string) {
    return this.prisma.tagBinding.findMany({ where: { entityType: 'BABY_PROFILE', entityId: id, revokedAt: null }, include: { tag: true } });
  }

  /** 编辑宝宝档案的风险标签（整体替换；只允许母婴风险分类的标签）。 */
  async setRiskTags(id: string, tagIds: string[]) {
    await this.findOneOrThrow(id);
    const r = await replaceRiskTags(this.prisma, { tenantId: this.ctx.tenantId!, accountId: this.ctx.accountId!, entityType: 'BABY_PROFILE', entityId: id, tagIds });
    await this.auditLogService.record({
      action: 'UPDATE',
      entityType: 'BabyProfile',
      entityId: id,
      remark: `修改风险标签：新增 ${r.added.length} 个，撤销 ${r.removed.length} 个`,
      tenantId: this.ctx.tenantId,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    });
    return this.getRiskTags(id);
  }

  async findOneOrThrow(id: string): Promise<BabyProfile> {
    const baby = await this.prisma.babyProfile.findUnique({ where: { id } });
    if (!baby) throw new NotFoundException(`BabyProfile ${id} 不存在`);
    return baby;
  }

  async create(dto: CreateBabyProfileDto): Promise<BabyProfile> {
    const motherProfile = await this.prisma.motherProfile.findUnique({ where: { id: dto.motherProfileId } });
    if (!motherProfile) throw new NotFoundException(`MotherProfile ${dto.motherProfileId} 不存在`);

    if ((dto.riskTagIds ?? []).length > 0) {
      const tags = await this.prisma.tag.findMany({ where: { id: { in: dto.riskTagIds }, tenantId: this.ctx.tenantId } });
      if (tags.length !== new Set(dto.riskTagIds).size) {
        throw new BadRequestException('存在不存在的标签 ID');
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const maxSeq = await tx.babyProfile.aggregate({
        where: { motherProfileId: dto.motherProfileId },
        _max: { sequenceNo: true },
      });
      const babyProfile = await tx.babyProfile.create({
        data: {
          tenantId: this.ctx.tenantId!,
          storeId: motherProfile.storeId,
          customerId: motherProfile.customerId,
          motherProfileId: dto.motherProfileId,
          sequenceNo: (maxSeq._max.sequenceNo ?? 0) + 1,
          name: dto.name,
          gender: dto.gender,
          birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
          birthWeightGrams: dto.birthWeightGrams,
          apgarScore: dto.apgarScore,
          allergens: dto.allergens?.trim() || null,
          remark: dto.remark,
          createdBy: this.ctx.accountId!,
        },
      });
      for (const tagId of dto.riskTagIds ?? []) {
        await tx.tagBinding.create({
          data: { tagId, entityType: 'BABY_PROFILE', entityId: babyProfile.id, tenantId: this.ctx.tenantId!, createdBy: this.ctx.accountId! },
        });
      }
      return babyProfile;
    });

    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'BabyProfile',
      entityId: created.id,
      afterData: created,
      ...this.auditCtx(),
    });
    return created;
  }

  async update(id: string, dto: UpdateBabyProfileDto): Promise<BabyProfile> {
    const before = await this.findOneOrThrow(id);
    if (before.version !== dto.version) {
      throw new ConflictException('数据已被他人修改，请刷新后重试');
    }
    const updated = await runVersionedUpdate(() =>
      this.prisma.babyProfile.update({
        where: { id, version: dto.version },
        data: {
          name: dto.name,
          gender: dto.gender,
          birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
          birthWeightGrams: dto.birthWeightGrams,
          apgarScore: dto.apgarScore,
          allergens: dto.allergens === undefined ? undefined : dto.allergens.trim() || null,
          remark: dto.remark,
          version: { increment: 1 },
        },
      }),
    );
    await this.auditLogService.record({
      action: 'UPDATE',
      entityType: 'BabyProfile',
      entityId: id,
      beforeData: before,
      afterData: updated,
      changedFields: Object.keys(dto).filter((k) => k !== 'version'),
      ...this.auditCtx(),
    });
    return updated;
  }

  /** 删除前的检查：有哪些数据挂在这个宝宝下面，能不能删，当前账号有没有"连数据一起删"的权限。 */
  async getDeleteCheck(id: string) {
    const baby = await this.findOneOrThrow(id);
    if (baby.tenantId !== this.ctx.tenantId) throw new NotFoundException(`BabyProfile ${id} 不存在`);
    const [records, plans, abnormalities, documents, admissions, discharges, dailies, medications, planVersions, serviceLogs, canForceDelete] = await Promise.all([
      this.prisma.careRecord.count({ where: { babyProfileId: id } }),
      this.prisma.carePlan.count({ where: { babyProfileId: id } }),
      this.prisma.careAbnormality.count({ where: { babyProfileId: id } }),
      this.prisma.careDocument.count({ where: { babyProfileId: id } }),
      this.prisma.careBabyAdmission.count({ where: { babyProfileId: id } }),
      this.prisma.careBabyDischarge.count({ where: { babyProfileId: id } }),
      this.prisma.careDailyBabyRecord.count({ where: { babyProfileId: id } }),
      this.prisma.careMedicationAuth.count({ where: { babyProfileId: id } }),
      this.prisma.carePlanVersion.count({ where: { babyProfileId: id } }),
      this.prisma.careServiceLog.count({ where: { babyProfileId: id } }),
      this.ctx.hasPermission('care.profile.force-delete'),
    ]);
    // 护理记录/计划/异常是真正的护理痕迹，任何人都不能连带删除；评估表和纸质资料（多半是录错了人）管理员可以连带删除
    const blockers = [records && `${records} 条护理记录`, dailies && `${dailies} 天日常护理记录`, plans && `${plans} 个护理计划`, abnormalities && `${abnormalities} 条护理异常`].filter(Boolean) as string[];
    const attached = [admissions && '新生儿入所评估', discharges && '宝宝出所评估', medications && `${medications} 份用药委托书`, planVersions && `${planVersions} 个护理计划版本`, serviceLogs && `${serviceLogs} 条服务执行记录`, documents && `${documents} 份纸质资料`].filter(Boolean) as string[];
    return {
      babyId: id,
      babyName: baby.name?.trim() || `宝宝${baby.sequenceNo}`,
      blockers,
      attached,
      canForceDelete,
    };
  }

  /**
   * 删除宝宝档案——用于"建错了/多建了/录到了错误的宝宝名下"。三道防线：
   * 1. 有护理记录/护理计划/护理异常的宝宝任何人都不能删（护理痕迹不能丢）；
   * 2. 只挂着评估表和纸质资料的：需要 care.profile.force-delete（管理员权限），并且请求里要带上宝宝名字确认，
   *    会连同这些评估表和纸质资料（含照片文件）一起永久删除，审计日志留痕；
   * 3. 什么数据都没有的，care.profile.update 即可直接删。
   * 删除后同一妈妈档案下剩余宝宝的序号重新排成 1、2、3…
   */
  async remove(id: string, force = false, confirmName?: string): Promise<void> {
    const check = await this.getDeleteCheck(id);
    const baby = await this.findOneOrThrow(id);
    if (check.blockers.length > 0) {
      throw new ConflictException(`该宝宝已有${check.blockers.join('、')}，属于护理痕迹，不能删除`);
    }
    if (check.attached.length > 0) {
      if (!force) {
        throw new ConflictException(`该宝宝名下已有${check.attached.join('、')}，直接删除会丢失这些数据；需要管理员确认后连同它们一起删除`);
      }
      if (!check.canForceDelete) {
        throw new ForbiddenException('该宝宝名下已有评估表/纸质资料，连同删除需要管理员权限，请联系管理员');
      }
      if (confirmName?.trim() !== check.babyName) {
        throw new BadRequestException(`请输入宝宝名字「${check.babyName}」确认删除`);
      }
    }

    const docs = await this.prisma.careDocument.findMany({ where: { babyProfileId: id }, select: { id: true, docType: true } });
    await this.prisma.$transaction(async (tx) => {
      await tx.careBabyAdmission.deleteMany({ where: { babyProfileId: id } });
      await tx.careBabyDischarge.deleteMany({ where: { babyProfileId: id } });
      await tx.careMedicationAuth.deleteMany({ where: { babyProfileId: id } }); // 药品行随之级联删除
      await tx.carePlanVersion.deleteMany({ where: { babyProfileId: id } });
      await tx.careServiceLog.deleteMany({ where: { babyProfileId: id } });
      await tx.careDocument.deleteMany({ where: { babyProfileId: id } }); // 照片记录随之级联删除
      await tx.tagBinding.deleteMany({ where: { entityType: 'BABY_PROFILE', entityId: id } });
      await tx.babyProfile.delete({ where: { id } });
      const rest = await tx.babyProfile.findMany({ where: { motherProfileId: baby.motherProfileId }, orderBy: { sequenceNo: 'asc' } });
      for (const [i, b] of rest.entries()) {
        if (b.sequenceNo !== i + 1) await tx.babyProfile.update({ where: { id: b.id }, data: { sequenceNo: i + 1 } });
      }
    });
    for (const d of docs) await this.storage.removeDocumentDir(d.id).catch(() => undefined);
    await this.auditLogService.record({
      action: 'DELETE',
      entityType: 'BabyProfile',
      entityId: id,
      beforeData: baby,
      remark: check.attached.length > 0 ? `管理员连同 ${check.attached.join('、')} 一起删除宝宝档案` : '删除宝宝档案',
      ...this.auditCtx(),
    });
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
