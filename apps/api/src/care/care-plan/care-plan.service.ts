import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CarePlan } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { generateBusinessNo } from '../../common/utils/business-no.util';
import { addDays } from '../../common/utils/date.util';
import { runVersionedUpdate } from '../../common/utils/versioned-update.util';
import { CreateCarePlanDto } from './dto/create-care-plan.dto';
import { QueryCarePlanDto } from './dto/query-care-plan.dto';

const includePlan = {
  tasks: { include: { formTemplate: true }, orderBy: { dayOffset: 'asc' as const } },
};

/**
 * 护理计划：motherProfileId/babyProfileId 二选一。创建时直接激活（不走 DRAFT 中间态，
 * 简化本切片范围），按 CarePlanTemplateItem 在同一事务里批量生成 CarePlanTask
 * （每日任务卡片），scheduledDate = startDate + (dayOffset - 1) 天。
 */
@Injectable()
export class CarePlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  findMany(query: QueryCarePlanDto = {}) {
    return this.prisma.carePlan.findMany({
      where: {
        tenantId: this.ctx.tenantId,
        motherProfileId: query.motherProfileId,
        babyProfileId: query.babyProfileId,
        status: query.status,
      },
      include: includePlan,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneOrThrow(id: string) {
    const plan = await this.prisma.carePlan.findUnique({ where: { id }, include: includePlan });
    if (!plan) throw new NotFoundException(`CarePlan ${id} 不存在`);
    return plan;
  }

  async create(dto: CreateCarePlanDto): Promise<CarePlan> {
    if (!!dto.motherProfileId === !!dto.babyProfileId) {
      throw new BadRequestException('motherProfileId 与 babyProfileId 必须二选一');
    }
    const template = await this.prisma.carePlanTemplate.findUnique({
      where: { id: dto.planTemplateId },
      include: { items: true },
    });
    if (!template) throw new NotFoundException(`CarePlanTemplate ${dto.planTemplateId} 不存在`);

    let storeId: string;
    if (dto.motherProfileId) {
      if (template.targetType !== 'MOTHER') throw new BadRequestException('护理方案的适用对象与妈妈档案不一致');
      const mother = await this.prisma.motherProfile.findUnique({ where: { id: dto.motherProfileId } });
      if (!mother) throw new NotFoundException(`MotherProfile ${dto.motherProfileId} 不存在`);
      storeId = mother.storeId;
    } else {
      if (template.targetType !== 'BABY') throw new BadRequestException('护理方案的适用对象与宝宝档案不一致');
      const baby = await this.prisma.babyProfile.findUnique({ where: { id: dto.babyProfileId! } });
      if (!baby) throw new NotFoundException(`BabyProfile ${dto.babyProfileId} 不存在`);
      storeId = baby.storeId;
    }

    const startDate = new Date(dto.startDate);
    const created = await this.prisma.$transaction(async (tx) => {
      const plan = await tx.carePlan.create({
        data: {
          tenantId: this.ctx.tenantId!,
          storeId,
          planNo: generateBusinessNo('CP'),
          planTemplateId: dto.planTemplateId,
          motherProfileId: dto.motherProfileId,
          babyProfileId: dto.babyProfileId,
          startDate,
          status: 'ACTIVE',
          createdBy: this.ctx.accountId!,
        },
      });
      await tx.carePlanTask.createMany({
        data: template.items.map((item) => ({
          carePlanId: plan.id,
          dayOffset: item.dayOffset,
          scheduledDate: addDays(startDate, item.dayOffset - 1),
          formTemplateId: item.formTemplateId,
        })),
      });
      return plan;
    });

    const withTasks = await this.findOneOrThrow(created.id);
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'CarePlan',
      entityId: created.id,
      afterData: withTasks,
      ...this.auditCtx(),
    });
    return withTasks as CarePlan;
  }

  async terminate(id: string, reason: string, expectedVersion: number): Promise<CarePlan> {
    const before = await this.findOneOrThrow(id);
    if (before.version !== expectedVersion) {
      throw new ConflictException('数据已被他人修改，请刷新后重试');
    }
    if (before.status !== 'ACTIVE') {
      throw new BadRequestException(`护理计划当前状态「${before.status}」不允许终止`);
    }
    const updated = await runVersionedUpdate(() => this.prisma.$transaction(async (tx) => {
      const plan = await tx.carePlan.update({
        where: { id, version: expectedVersion },
        data: { status: 'TERMINATED', terminateReason: reason, version: { increment: 1 } },
      });
      await tx.carePlanTask.updateMany({
        where: { carePlanId: id, status: 'PENDING' },
        data: { status: 'MISSED' },
      });
      return plan;
    }));
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'CarePlan',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: `ACTIVE -> TERMINATED：${reason}`,
      ...this.auditCtx(),
    });
    return this.findOneOrThrow(id) as Promise<CarePlan>;
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
