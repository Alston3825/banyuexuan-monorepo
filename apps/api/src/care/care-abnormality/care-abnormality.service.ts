import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CareAbnormality } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { runVersionedUpdate } from '../../common/utils/versioned-update.util';
import { FollowUpService } from '../../crm/follow-up/follow-up.service';
import { QueryCareAbnormalityDto } from './dto/query-care-abnormality.dto';
import { FollowUpCareAbnormalityDto } from './dto/follow-up-care-abnormality.dto';
import { ResolveCareAbnormalityDto } from './dto/resolve-care-abnormality.dto';

const includeAbnormality = {
  field: true,
  careRecord: true,
};

/**
 * 护理异常：状态机 OPEN -> FOLLOWING -> RESOLVED；OPEN/FOLLOWING -> IGNORED。
 * 跟进复用平台通用 FollowUpRecord（businessType='CARE_ABNORMALITY'），不新建独立
 * 跟进表——首次跟进时顺带把 OPEN 推进到 FOLLOWING（同 LeadService.markFollowing 的
 * 处理口径），后续跟进不再重复迁移状态。
 */
@Injectable()
export class CareAbnormalityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly followUpService: FollowUpService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  findMany(query: QueryCareAbnormalityDto = {}) {
    return this.prisma.careAbnormality.findMany({
      where: {
        tenantId: this.ctx.tenantId,
        motherProfileId: query.motherProfileId,
        babyProfileId: query.babyProfileId,
        status: query.status,
      },
      include: includeAbnormality,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneOrThrow(id: string): Promise<CareAbnormality> {
    const abnormality = await this.prisma.careAbnormality.findUnique({ where: { id }, include: includeAbnormality });
    if (!abnormality) throw new NotFoundException(`CareAbnormality ${id} 不存在`);
    return abnormality as CareAbnormality;
  }

  getFollowUps(id: string) {
    return this.followUpService.findMany('CARE_ABNORMALITY', id);
  }

  async follow(id: string, dto: FollowUpCareAbnormalityDto) {
    const abnormality = await this.findOneOrThrow(id);
    if (!['OPEN', 'FOLLOWING'].includes(abnormality.status)) {
      throw new BadRequestException(`护理异常当前状态「${abnormality.status}」不允许添加跟进记录`);
    }
    const followUp = await this.followUpService.create({
      businessType: 'CARE_ABNORMALITY',
      businessId: id,
      type: dto.type,
      content: dto.content,
      nextFollowUpAt: dto.nextFollowUpAt,
    });
    if (abnormality.status === 'OPEN') {
      await this.prisma.careAbnormality.update({
        where: { id },
        data: { status: 'FOLLOWING', version: { increment: 1 } },
      });
    }
    return followUp;
  }

  async resolve(id: string, dto: ResolveCareAbnormalityDto): Promise<CareAbnormality> {
    return this.transitionToTerminal(id, dto, 'RESOLVED');
  }

  async ignore(id: string, dto: ResolveCareAbnormalityDto): Promise<CareAbnormality> {
    return this.transitionToTerminal(id, dto, 'IGNORED');
  }

  private async transitionToTerminal(
    id: string,
    dto: ResolveCareAbnormalityDto,
    target: 'RESOLVED' | 'IGNORED',
  ): Promise<CareAbnormality> {
    const before = await this.findOneOrThrow(id);
    if (before.version !== dto.version) {
      throw new ConflictException('数据已被他人修改，请刷新后重试');
    }
    if (!['OPEN', 'FOLLOWING'].includes(before.status)) {
      throw new BadRequestException(`护理异常当前状态「${before.status}」不允许此操作`);
    }
    const updated = await runVersionedUpdate(() =>
      this.prisma.careAbnormality.update({
        where: { id, version: dto.version },
        data: {
          status: target,
          resolveNote: dto.resolveNote,
          resolvedBy: this.ctx.accountId,
          resolvedAt: new Date(),
          version: { increment: 1 },
        },
      }),
    );
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'CareAbnormality',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: `${before.status} -> ${target}`,
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
