import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MealPlanTemplate } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { CreateMealPlanTemplateDto } from './dto/create-meal-plan-template.dto';
import { UpdateMealPlanTemplateDto } from './dto/update-meal-plan-template.dto';
import { MealPlanTemplateItemDto } from './dto/meal-plan-template-item.dto';

const includeItems = {
  items: { include: { mealItem: true }, orderBy: [{ dayOffset: 'asc' as const }, { slot: 'asc' as const }] },
};

/** 膳食计划模板：天数排期通过中间表维护，创建/替换整体在事务里做（同 CarePlanTemplateService 模式）。 */
@Injectable()
export class MealPlanTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  findMany() {
    return this.prisma.mealPlanTemplate.findMany({ where: { tenantId: this.ctx.tenantId }, include: includeItems, orderBy: { createdAt: 'desc' } });
  }

  async findOneOrThrow(id: string) {
    const template = await this.prisma.mealPlanTemplate.findUnique({ where: { id }, include: includeItems });
    if (!template) throw new NotFoundException(`MealPlanTemplate ${id} 不存在`);
    return template;
  }

  private async assertItemsValid(items: MealPlanTemplateItemDto[], totalDays: number) {
    const overLimit = items.find((i) => i.dayOffset > totalDays);
    if (overLimit) throw new BadRequestException(`排期第 ${overLimit.dayOffset} 天超出方案总天数 ${totalDays} 天`);
    const mealItemIds = [...new Set(items.map((i) => i.mealItemId))];
    const mealItems = await this.prisma.mealItem.findMany({ where: { id: { in: mealItemIds } } });
    if (mealItems.length !== mealItemIds.length) throw new BadRequestException('存在不存在的菜品 ID');
  }

  async create(dto: CreateMealPlanTemplateDto): Promise<MealPlanTemplate> {
    await this.assertItemsValid(dto.items, dto.totalDays);
    const created = await this.prisma.$transaction(async (tx) => {
      const template = await tx.mealPlanTemplate.create({
        data: {
          tenantId: this.ctx.tenantId!,
          code: dto.code,
          name: dto.name,
          planType: dto.planType,
          totalDays: dto.totalDays,
          phases: dto.phases as any,
          createdBy: this.ctx.accountId!,
        },
      });
      await tx.mealPlanTemplateItem.createMany({
        data: dto.items.map((i) => ({ planTemplateId: template.id, dayOffset: i.dayOffset, slot: i.slot, mealItemId: i.mealItemId })),
      });
      return template;
    });
    const withItems = await this.findOneOrThrow(created.id);
    await this.auditLogService.record({ action: 'CREATE', entityType: 'MealPlanTemplate', entityId: created.id, afterData: withItems, ...this.auditCtx() });
    return withItems as MealPlanTemplate;
  }

  async update(id: string, dto: UpdateMealPlanTemplateDto): Promise<MealPlanTemplate> {
    const before = await this.findOneOrThrow(id);
    if (before.version !== dto.version) throw new ConflictException('数据已被他人修改，请刷新后重试');
    if (dto.items) await this.assertItemsValid(dto.items, before.totalDays);
    const updated = await this.prisma.$transaction(async (tx) => {
      const template = await tx.mealPlanTemplate.update({
        where: { id },
        data: { name: dto.name, status: dto.status, version: { increment: 1 } },
      });
      if (dto.items) {
        await tx.mealPlanTemplateItem.deleteMany({ where: { planTemplateId: id } });
        await tx.mealPlanTemplateItem.createMany({
          data: dto.items.map((i) => ({ planTemplateId: id, dayOffset: i.dayOffset, slot: i.slot, mealItemId: i.mealItemId })),
        });
      }
      return template;
    });
    const withItems = await this.findOneOrThrow(updated.id);
    await this.auditLogService.record({
      action: 'UPDATE',
      entityType: 'MealPlanTemplate',
      entityId: id,
      beforeData: before,
      afterData: withItems,
      changedFields: Object.keys(dto).filter((k) => k !== 'version'),
      ...this.auditCtx(),
    });
    return withItems as MealPlanTemplate;
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
