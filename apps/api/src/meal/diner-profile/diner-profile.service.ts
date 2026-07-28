import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DinerProfile } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { addDays } from '../../common/utils/date.util';
import { CreateDinerProfileDto } from './dto/create-diner-profile.dto';
import { QueryDinerProfileDto } from './dto/query-diner-profile.dto';

const includeProfile = {
  mealPlanTemplate: true,
  restrictions: { include: { restriction: true } },
};

/**
 * 用膳人：绑定膳食计划模板的一段用膳周期。创建时按模板的 MealPlanTemplateItem
 * 批量生成 MealRecord（同 CarePlan 按 CarePlanTemplateItem 生成 CarePlanTask 的模式）。
 */
@Injectable()
export class DinerProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  findMany(query: QueryDinerProfileDto = {}): Promise<DinerProfile[]> {
    return this.prisma.dinerProfile.findMany({
      where: { tenantId: this.ctx.tenantId, customerId: query.customerId },
      include: includeProfile,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneOrThrow(id: string) {
    const profile = await this.prisma.dinerProfile.findUnique({ where: { id }, include: includeProfile });
    if (!profile) throw new NotFoundException(`DinerProfile ${id} 不存在`);
    return profile;
  }

  async create(dto: CreateDinerProfileDto): Promise<DinerProfile> {
    const [customer, template] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: dto.customerId } }),
      this.prisma.mealPlanTemplate.findUnique({ where: { id: dto.mealPlanTemplateId }, include: { items: true } }),
    ]);
    if (!customer) throw new NotFoundException(`Customer ${dto.customerId} 不存在`);
    if (!template) throw new NotFoundException(`MealPlanTemplate ${dto.mealPlanTemplateId} 不存在`);
    if (template.items.length === 0) throw new BadRequestException('该膳食计划模板尚未配置排期，无法生成用膳人');

    if (dto.restrictionIds?.length) {
      const restrictions = await this.prisma.dietaryRestriction.findMany({ where: { id: { in: dto.restrictionIds } } });
      if (restrictions.length !== dto.restrictionIds.length) throw new BadRequestException('存在不存在的禁忌 ID');
    }

    const storeId = dto.occupancyId
      ? (await this.prisma.roomOccupancy.findUnique({ where: { id: dto.occupancyId } }))?.storeId
      : this.ctx.homeStoreId;
    if (!storeId) throw new BadRequestException('无法确定门店，请传入 occupancyId 或确保当前账号绑定门店');

    const startDate = new Date(dto.startDate);
    const endDate = addDays(startDate, template.totalDays - 1);

    const created = await this.prisma.$transaction(async (tx) => {
      const profile = await tx.dinerProfile.create({
        data: {
          tenantId: this.ctx.tenantId!,
          storeId,
          customerId: dto.customerId,
          mealPlanTemplateId: dto.mealPlanTemplateId,
          occupancyId: dto.occupancyId,
          startDate,
          endDate,
          createdBy: this.ctx.accountId!,
        },
      });
      if (dto.restrictionIds?.length) {
        await tx.dinerRestriction.createMany({
          data: dto.restrictionIds.map((restrictionId) => ({ dinerProfileId: profile.id, restrictionId })),
        });
      }
      await tx.mealRecord.createMany({
        data: template.items.map((item) => ({
          tenantId: this.ctx.tenantId!,
          storeId,
          dinerProfileId: profile.id,
          scheduledDate: addDays(startDate, item.dayOffset - 1),
          slot: item.slot,
          defaultMealItemId: item.mealItemId,
        })),
      });
      return profile;
    });

    const withIncludes = await this.findOneOrThrow(created.id);
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'DinerProfile',
      entityId: created.id,
      afterData: withIncludes,
      ...this.auditCtx(storeId),
    });
    return withIncludes as unknown as DinerProfile;
  }

  async end(id: string): Promise<DinerProfile> {
    const before = await this.findOneOrThrow(id);
    if (before.status !== 'ACTIVE') throw new BadRequestException(`用膳人当前状态「${before.status}」不允许结束`);
    const updated = await this.prisma.dinerProfile.update({
      where: { id },
      data: { status: 'ENDED', version: { increment: 1 } },
    });
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'DinerProfile',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: 'ACTIVE -> ENDED',
      ...this.auditCtx(before.storeId),
    });
    return updated;
  }

  private auditCtx(storeId: string) {
    return {
      tenantId: this.ctx.tenantId,
      storeId,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    };
  }
}
