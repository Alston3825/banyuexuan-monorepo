import { BadRequestException, Injectable } from '@nestjs/common';
import { FollowUpRecord } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { LeadService } from '../lead/lead.service';

/**
 * 跟进记录：只增不改的日志类实体（同 WorkflowActionLog 风格），不做门店范围过滤。
 * businessType='LEAD' 时会联动 Lead 的状态机：只有处于 ASSIGNED/FOLLOWING 的线索
 * 才能被跟进（未分配线索不该有人跟进），若原状态是 ASSIGNED 则顺带推进到 FOLLOWING。
 * businessType='CARE_ABNORMALITY' 时被 CareAbnormalityService 复用（护理异常跟进不
 * 新建独立表），走通用分支，无联动副作用——由调用方自行决定异常状态是否推进。
 */
@Injectable()
export class FollowUpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leadService: LeadService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  findMany(businessType: string, businessId: string): Promise<FollowUpRecord[]> {
    return this.prisma.followUpRecord.findMany({
      where: { tenantId: this.ctx.tenantId, businessType, businessId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: {
    businessType: 'LEAD' | 'OPPORTUNITY' | 'CUSTOMER' | 'CARE_ABNORMALITY';
    businessId: string;
    type: FollowUpRecord['type'];
    content: string;
    nextFollowUpAt?: string;
  }): Promise<FollowUpRecord> {
    if (data.businessType === 'LEAD') {
      const lead = await this.leadService.findOneOrThrow(data.businessId);
      if (!['ASSIGNED', 'FOLLOWING'].includes(lead.status)) {
        throw new BadRequestException(`线索当前状态「${lead.status}」不允许添加跟进记录`);
      }
      await this.leadService.markFollowing(data.businessId);
    }

    const created = await this.prisma.followUpRecord.create({
      data: {
        businessType: data.businessType,
        businessId: data.businessId,
        type: data.type,
        content: data.content,
        nextFollowUpAt: data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : undefined,
        tenantId: this.ctx.tenantId!,
        createdBy: this.ctx.accountId!,
      },
    });
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'FollowUpRecord',
      entityId: created.id,
      afterData: created,
      tenantId: this.ctx.tenantId,
      storeId: this.ctx.homeStoreId,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    });
    return created;
  }
}
