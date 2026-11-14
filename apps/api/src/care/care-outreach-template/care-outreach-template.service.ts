import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { runVersionedUpdate } from '../../common/utils/versioned-update.util';
import { CreateCareOutreachTemplateDto } from './dto/create-care-outreach-template.dto';
import { UpdateCareOutreachTemplateDto } from './dto/update-care-outreach-template.dto';

const includeItems = {
  items: { orderBy: { dayOffset: 'asc' as const } },
};

/**
 * 关怀模板：总部统一定义关怀节点框架，同 care.plan-template/care.form-template 口径仅
 * SUPER_ADMIN维护。具体第几天提醒什么内容由用户/护理团队自行配置，不预设任何医学随访规则
 * （见业务规则确认记录"离店后关怀跟踪模块实现中"）。
 * CareOutreachTask 落地时会把节点内容快照进任务本身（不保留对 Item 的外键），因此这里
 * 整体替换节点列表不会影响已生成的历史计划，不需要像 TrainingExam 那样限定"只有草稿能改"。
 */
@Injectable()
export class CareOutreachTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  findMany() {
    return this.prisma.careOutreachTemplate.findMany({
      where: { tenantId: this.ctx.tenantId },
      include: includeItems,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneOrThrow(id: string) {
    const template = await this.prisma.careOutreachTemplate.findUnique({ where: { id }, include: includeItems });
    if (!template) throw new NotFoundException(`CareOutreachTemplate ${id} 不存在`);
    return template;
  }

  async create(dto: CreateCareOutreachTemplateDto) {
    const created = await this.prisma.$transaction(async (tx) => {
      const template = await tx.careOutreachTemplate.create({
        data: {
          tenantId: this.ctx.tenantId!,
          code: dto.code,
          name: dto.name,
          createdBy: this.ctx.accountId!,
        },
      });
      await tx.careOutreachTemplateItem.createMany({
        data: dto.items.map((item) => ({
          templateId: template.id,
          dayOffset: item.dayOffset,
          title: item.title,
          content: item.content,
        })),
      });
      return template;
    });
    const withItems = await this.findOneOrThrow(created.id);
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'CareOutreachTemplate',
      entityId: created.id,
      afterData: withItems,
      ...this.auditCtx(),
    });
    return withItems;
  }

  async update(id: string, dto: UpdateCareOutreachTemplateDto) {
    const before = await this.findOneOrThrow(id);
    if (before.version !== dto.version) {
      throw new ConflictException('数据已被他人修改，请刷新后重试');
    }
    const updated = await runVersionedUpdate(() => this.prisma.$transaction(async (tx) => {
      const template = await tx.careOutreachTemplate.update({
        where: { id, version: dto.version },
        data: { name: dto.name, status: dto.status, version: { increment: 1 } },
      });
      if (dto.items) {
        await tx.careOutreachTemplateItem.deleteMany({ where: { templateId: id } });
        await tx.careOutreachTemplateItem.createMany({
          data: dto.items.map((item) => ({
            templateId: id,
            dayOffset: item.dayOffset,
            title: item.title,
            content: item.content,
          })),
        });
      }
      return template;
    }));
    const withItems = await this.findOneOrThrow(updated.id);
    await this.auditLogService.record({
      action: 'UPDATE',
      entityType: 'CareOutreachTemplate',
      entityId: id,
      beforeData: before,
      afterData: withItems,
      changedFields: Object.keys(dto).filter((k) => k !== 'version'),
      ...this.auditCtx(),
    });
    return withItems;
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
