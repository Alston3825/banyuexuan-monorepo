import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CarePlanTemplate } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { runVersionedUpdate } from '../../common/utils/versioned-update.util';
import { CreateCarePlanTemplateDto } from './dto/create-care-plan-template.dto';
import { UpdateCarePlanTemplateDto } from './dto/update-care-plan-template.dto';
import { QueryCarePlanTemplateDto } from './dto/query-care-plan-template.dto';
import { CarePlanTemplateItemDto } from './dto/care-plan-template-item.dto';

const includeItems = {
  items: { include: { formTemplate: true }, orderBy: { dayOffset: 'asc' as const } },
};

/**
 * 护理方案（模板）：把多个表单模板按"入住第几天"组合成天数化方案。天数排期通过
 * 中间表维护，创建/替换整体在事务里做。校验每个排期项引用的表单模板 targetType
 * 必须与方案一致，dayOffset 不能超出 totalDays。
 */
@Injectable()
export class CarePlanTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  findMany(query: QueryCarePlanTemplateDto = {}): Promise<CarePlanTemplate[]> {
    return this.prisma.carePlanTemplate.findMany({
      where: { tenantId: this.ctx.tenantId, targetType: query.targetType },
      include: includeItems,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneOrThrow(id: string) {
    const template = await this.prisma.carePlanTemplate.findUnique({ where: { id }, include: includeItems });
    if (!template) throw new NotFoundException(`CarePlanTemplate ${id} 不存在`);
    return template;
  }

  private async assertItemsValid(items: CarePlanTemplateItemDto[], targetType: string, totalDays: number) {
    const overLimit = items.find((i) => i.dayOffset > totalDays);
    if (overLimit) {
      throw new BadRequestException(`排期第 ${overLimit.dayOffset} 天超出方案总天数 ${totalDays} 天`);
    }
    const formTemplateIds = [...new Set(items.map((i) => i.formTemplateId))];
    const templates = await this.prisma.careFormTemplate.findMany({ where: { id: { in: formTemplateIds } } });
    if (templates.length !== formTemplateIds.length) {
      throw new BadRequestException('存在不存在的护理项目（表单模板）ID');
    }
    const mismatched = templates.find((t) => t.targetType !== targetType);
    if (mismatched) {
      throw new BadRequestException(`护理项目「${mismatched.name}」的适用对象与方案不一致`);
    }
  }

  async create(dto: CreateCarePlanTemplateDto) {
    await this.assertItemsValid(dto.items, dto.targetType, dto.totalDays);
    const created = await this.prisma.$transaction(async (tx) => {
      const template = await tx.carePlanTemplate.create({
        data: {
          tenantId: this.ctx.tenantId!,
          code: dto.code,
          name: dto.name,
          targetType: dto.targetType,
          totalDays: dto.totalDays,
          createdBy: this.ctx.accountId!,
        },
      });
      await tx.carePlanTemplateItem.createMany({
        data: dto.items.map((i) => ({
          planTemplateId: template.id,
          dayOffset: i.dayOffset,
          formTemplateId: i.formTemplateId,
        })),
      });
      return template;
    });
    const withItems = await this.findOneOrThrow(created.id);
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'CarePlanTemplate',
      entityId: created.id,
      afterData: withItems,
      ...this.auditCtx(),
    });
    return withItems;
  }

  async update(id: string, dto: UpdateCarePlanTemplateDto) {
    const before = await this.findOneOrThrow(id);
    if (before.version !== dto.version) {
      throw new ConflictException('数据已被他人修改，请刷新后重试');
    }
    if (dto.items) {
      await this.assertItemsValid(dto.items, before.targetType, before.totalDays);
    }
    const updated = await runVersionedUpdate(() => this.prisma.$transaction(async (tx) => {
      const template = await tx.carePlanTemplate.update({
        where: { id, version: dto.version },
        data: {
          name: dto.name,
          status: dto.status,
          version: { increment: 1 },
        },
      });
      if (dto.items) {
        await tx.carePlanTemplateItem.deleteMany({ where: { planTemplateId: id } });
        await tx.carePlanTemplateItem.createMany({
          data: dto.items.map((i) => ({
            planTemplateId: id,
            dayOffset: i.dayOffset,
            formTemplateId: i.formTemplateId,
          })),
        });
      }
      return template;
    }));
    const withItems = await this.findOneOrThrow(updated.id);
    await this.auditLogService.record({
      action: 'UPDATE',
      entityType: 'CarePlanTemplate',
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
