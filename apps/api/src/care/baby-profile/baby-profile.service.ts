import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BabyProfile } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
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
  ) {}

  findMany(query: QueryBabyProfileDto = {}): Promise<BabyProfile[]> {
    return this.prisma.babyProfile.findMany({
      where: { tenantId: this.ctx.tenantId, motherProfileId: query.motherProfileId, customerId: query.customerId },
      orderBy: [{ motherProfileId: 'asc' }, { sequenceNo: 'asc' }],
    });
  }

  getRiskTags(id: string) {
    return this.prisma.tagBinding.findMany({ where: { entityType: 'BABY_PROFILE', entityId: id }, include: { tag: true } });
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
    const updated = await this.prisma.babyProfile.update({
      where: { id },
      data: {
        name: dto.name,
        gender: dto.gender,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        birthWeightGrams: dto.birthWeightGrams,
        apgarScore: dto.apgarScore,
        remark: dto.remark,
        version: { increment: 1 },
      },
    });
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
