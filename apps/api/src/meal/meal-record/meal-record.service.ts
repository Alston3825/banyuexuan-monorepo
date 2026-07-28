import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MealRecord } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { QueryMealRecordDto } from './dto/query-meal-record.dto';
import { SelectMealRecordDto } from './dto/select-meal-record.dto';
import { FeedbackMealRecordDto } from './dto/feedback-meal-record.dto';

const SELF_SELECT_CUTOFF_HOUR = 9;
/** 早餐/早点当日无法自选，须提前一天选定（竞品分析3.6"自选餐机制"）。 */
const NO_SAME_DAY_SELECT_SLOTS = ['BREAKFAST', 'MORNING_SNACK'];

const includeRecord = { defaultMealItem: true, selectedMealItem: true };

/**
 * 每日排餐记录：PLANNED -(自选，可选)-> PLANNED(isCustomSelected=true) -(供餐)-> SERVED；
 * 自选规则：当日9点前可选，早餐/早点不可当日选，且不能与用膳人的食材类禁忌冲突。
 */
@Injectable()
export class MealRecordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  findMany(query: QueryMealRecordDto = {}) {
    return this.prisma.mealRecord.findMany({
      where: {
        tenantId: this.ctx.tenantId,
        dinerProfileId: query.dinerProfileId,
        scheduledDate: query.scheduledDate ? new Date(query.scheduledDate) : undefined,
        status: query.status,
      },
      include: includeRecord,
      orderBy: [{ scheduledDate: 'asc' }, { slot: 'asc' }],
    });
  }

  async findOneOrThrow(id: string) {
    const record = await this.prisma.mealRecord.findUnique({ where: { id }, include: includeRecord });
    if (!record) throw new NotFoundException(`MealRecord ${id} 不存在`);
    return record;
  }

  async select(id: string, dto: SelectMealRecordDto): Promise<MealRecord> {
    const before = await this.findOneOrThrow(id);
    if (before.status !== 'PLANNED') throw new BadRequestException(`排餐记录当前状态「${before.status}」不允许自选`);

    this.assertWithinSelectWindow(before.scheduledDate, before.slot);

    const mealItem = await this.prisma.mealItem.findUnique({ where: { id: dto.mealItemId } });
    if (!mealItem) throw new NotFoundException(`MealItem ${dto.mealItemId} 不存在`);

    await this.assertNoIngredientConflict(before.dinerProfileId, mealItem);

    const updated = await this.prisma.mealRecord.update({
      where: { id },
      data: { isCustomSelected: true, selectedMealItemId: mealItem.id, selectedAt: new Date(), version: { increment: 1 } },
      include: includeRecord,
    });
    await this.auditLogService.record({
      action: 'UPDATE',
      entityType: 'MealRecord',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: `自选餐：${mealItem.name}`,
      ...this.auditCtx(before.storeId),
    });
    return updated;
  }

  async serve(id: string): Promise<MealRecord> {
    const before = await this.findOneOrThrow(id);
    if (before.status !== 'PLANNED') throw new BadRequestException(`排餐记录当前状态「${before.status}」不允许供餐`);
    const updated = await this.prisma.mealRecord.update({
      where: { id },
      data: { status: 'SERVED', servedAt: new Date(), servedBy: this.ctx.accountId, version: { increment: 1 } },
      include: includeRecord,
    });
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'MealRecord',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: 'PLANNED -> SERVED',
      ...this.auditCtx(before.storeId),
    });
    return updated;
  }

  async feedback(id: string, dto: FeedbackMealRecordDto): Promise<MealRecord> {
    const before = await this.findOneOrThrow(id);
    if (before.status !== 'SERVED') throw new BadRequestException('只能对已供餐的记录评价');
    const updated = await this.prisma.mealRecord.update({
      where: { id },
      data: { rating: dto.rating, comment: dto.comment, version: { increment: 1 } },
      include: includeRecord,
    });
    await this.auditLogService.record({
      action: 'UPDATE',
      entityType: 'MealRecord',
      entityId: id,
      beforeData: before,
      afterData: updated,
      changedFields: ['rating', 'comment'],
      ...this.auditCtx(before.storeId),
    });
    return updated;
  }

  private assertWithinSelectWindow(scheduledDate: Date, slot: string) {
    const now = new Date();
    const scheduledDayStart = new Date(Date.UTC(scheduledDate.getUTCFullYear(), scheduledDate.getUTCMonth(), scheduledDate.getUTCDate()));
    const isSameDay = now.getTime() >= scheduledDayStart.getTime() && now.getTime() < scheduledDayStart.getTime() + 24 * 60 * 60 * 1000;

    if (now.getTime() >= scheduledDayStart.getTime() + 24 * 60 * 60 * 1000) {
      throw new BadRequestException('该餐次日期已过，无法自选');
    }
    if (isSameDay) {
      if (NO_SAME_DAY_SELECT_SLOTS.includes(slot)) {
        throw new BadRequestException('早餐/早点不可当日自选，须提前一天选定');
      }
      const cutoff = new Date(scheduledDayStart.getTime());
      cutoff.setUTCHours(SELF_SELECT_CUTOFF_HOUR, 0, 0, 0);
      if (now.getTime() >= cutoff.getTime()) {
        throw new BadRequestException('已过当日9点自选截止时间');
      }
    }
  }

  private async assertNoIngredientConflict(dinerProfileId: string, mealItem: { ingredientTags: unknown; name: string }) {
    const tags = (mealItem.ingredientTags as string[] | null) ?? [];
    if (tags.length === 0) return;
    const restrictions = await this.prisma.dinerRestriction.findMany({
      where: { dinerProfileId, restriction: { category: 'INGREDIENT' } },
      include: { restriction: true },
    });
    const restrictedNames = restrictions.map((r) => r.restriction.name);
    const conflicts = tags.filter((tag) => restrictedNames.includes(tag));
    if (conflicts.length > 0) {
      throw new BadRequestException(`菜品「${mealItem.name}」含用膳人禁忌食材：${conflicts.join('、')}`);
    }
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
