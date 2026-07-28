import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CareAbnormality, CareFieldDefinition, CareRecord } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { generateBusinessNo } from '../../common/utils/business-no.util';
import { CreateCareRecordDto } from './dto/create-care-record.dto';
import { QueryCareRecordDto } from './dto/query-care-record.dto';

const includeRecord = {
  formTemplate: true,
  corrections: true,
  abnormalities: true,
};

/**
 * 护理执行记录：一旦提交不可编辑（本服务不提供 update），当天遗漏走"补录"
 * （isBackfilled+backfillReason），对已提交记录的修正走"更正"（correctionOfId 指向
 * 原记录，原记录保留、新增一条更正记录）——业务规则确认记录#7。提交时按字段定义的
 * 正常值域自动判定并生成 CareAbnormality（单档判定，不做多级严重度）。
 */
@Injectable()
export class CareRecordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  findMany(query: QueryCareRecordDto = {}) {
    return this.prisma.careRecord.findMany({
      where: {
        tenantId: this.ctx.tenantId,
        motherProfileId: query.motherProfileId,
        babyProfileId: query.babyProfileId,
        formTemplateId: query.formTemplateId,
      },
      include: includeRecord,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneOrThrow(id: string) {
    const record = await this.prisma.careRecord.findUnique({ where: { id }, include: includeRecord });
    if (!record) throw new NotFoundException(`CareRecord ${id} 不存在`);
    return record;
  }

  private validateValuesAgainstTemplate(
    values: Record<string, unknown>,
    fields: { required: boolean; field: CareFieldDefinition }[],
  ) {
    const byCode = new Map(fields.map((f) => [f.field.code, f]));
    for (const code of Object.keys(values)) {
      if (!byCode.has(code)) {
        throw new BadRequestException(`字段「${code}」不属于该表单模板`);
      }
    }
    for (const { required, field } of fields) {
      const value = values[field.code];
      if (required && (value === undefined || value === null || value === '')) {
        throw new BadRequestException(`字段「${field.name}」为必填项`);
      }
      if (value === undefined || value === null || value === '') continue;
      if (field.controlType === 'NUMBER' && typeof value !== 'number') {
        throw new BadRequestException(`字段「${field.name}」应为数值`);
      }
      if ((field.controlType === 'SELECT' || field.controlType === 'RADIO') && field.options) {
        const optionValues = (field.options as { value: string }[]).map((o) => o.value);
        if (!optionValues.includes(String(value))) {
          throw new BadRequestException(`字段「${field.name}」的值不在候选项范围内`);
        }
      }
    }
  }

  private detectAbnormalFields(
    values: Record<string, unknown>,
    fields: { field: CareFieldDefinition }[],
  ): CareFieldDefinition[] {
    const abnormal: CareFieldDefinition[] = [];
    for (const { field } of fields) {
      const value = values[field.code];
      if (value === undefined || value === null || value === '') continue;
      if (field.controlType === 'NUMBER' && typeof value === 'number') {
        if ((field.normalMin !== null && value < field.normalMin!) || (field.normalMax !== null && value > field.normalMax!)) {
          abnormal.push(field);
        }
      } else if (field.normalOptionValues) {
        const normalValues = field.normalOptionValues as string[];
        if (!normalValues.includes(String(value))) {
          abnormal.push(field);
        }
      }
    }
    return abnormal;
  }

  async create(dto: CreateCareRecordDto): Promise<{ record: CareRecord; abnormalities: CareAbnormality[] }> {
    if (!!dto.motherProfileId === !!dto.babyProfileId) {
      throw new BadRequestException('motherProfileId 与 babyProfileId 必须二选一');
    }
    if (dto.isBackfilled && !dto.backfillReason) {
      throw new BadRequestException('补录记录必须填写补录原因');
    }

    const template = await this.prisma.careFormTemplate.findUnique({
      where: { id: dto.formTemplateId },
      include: { fields: { include: { field: true } } },
    });
    if (!template) throw new NotFoundException(`CareFormTemplate ${dto.formTemplateId} 不存在`);

    let storeId: string;
    if (dto.motherProfileId) {
      if (template.targetType !== 'MOTHER') throw new BadRequestException('表单模板的适用对象与妈妈档案不一致');
      const mother = await this.prisma.motherProfile.findUnique({ where: { id: dto.motherProfileId } });
      if (!mother) throw new NotFoundException(`MotherProfile ${dto.motherProfileId} 不存在`);
      storeId = mother.storeId;
    } else {
      if (template.targetType !== 'BABY') throw new BadRequestException('表单模板的适用对象与宝宝档案不一致');
      const baby = await this.prisma.babyProfile.findUnique({ where: { id: dto.babyProfileId! } });
      if (!baby) throw new NotFoundException(`BabyProfile ${dto.babyProfileId} 不存在`);
      storeId = baby.storeId;
    }

    this.validateValuesAgainstTemplate(dto.values, template.fields);

    let originalRecord: CareRecord | null = null;
    if (dto.correctionOfId) {
      originalRecord = await this.prisma.careRecord.findUnique({ where: { id: dto.correctionOfId } });
      if (!originalRecord) throw new NotFoundException(`CareRecord ${dto.correctionOfId} 不存在`);
      if (originalRecord.formTemplateId !== dto.formTemplateId) {
        throw new BadRequestException('更正记录的表单模板必须与被更正记录一致');
      }
      if (
        (dto.motherProfileId && originalRecord.motherProfileId !== dto.motherProfileId) ||
        (dto.babyProfileId && originalRecord.babyProfileId !== dto.babyProfileId)
      ) {
        throw new BadRequestException('更正记录的档案必须与被更正记录一致');
      }
    }

    let task: { id: string; carePlanId: string; status: string; formTemplateId: string } | null = null;
    if (dto.carePlanTaskId) {
      task = await this.prisma.carePlanTask.findUnique({ where: { id: dto.carePlanTaskId } });
      if (!task) throw new NotFoundException(`CarePlanTask ${dto.carePlanTaskId} 不存在`);
      if (task.formTemplateId !== dto.formTemplateId) {
        throw new BadRequestException('任务卡片对应的表单模板与提交的表单不一致');
      }
      if (task.status !== 'PENDING') {
        throw new BadRequestException(`任务卡片当前状态「${task.status}」不允许提交（如需更正已完成记录，请使用更正接口）`);
      }
    }

    const abnormalFields = this.detectAbnormalFields(dto.values, template.fields);

    const created = await this.prisma.$transaction(async (tx) => {
      const record = await tx.careRecord.create({
        data: {
          tenantId: this.ctx.tenantId!,
          storeId,
          recordNo: generateBusinessNo('CR'),
          formTemplateId: dto.formTemplateId,
          targetType: template.targetType,
          motherProfileId: dto.motherProfileId,
          babyProfileId: dto.babyProfileId,
          occurredAt: new Date(dto.occurredAt),
          values: dto.values as any,
          isBackfilled: dto.isBackfilled ?? false,
          backfillReason: dto.backfillReason,
          correctionOfId: dto.correctionOfId,
          submittedBy: this.ctx.accountId!,
        },
      });

      if (task) {
        await tx.carePlanTask.update({
          where: { id: task.id },
          data: { status: 'COMPLETED', careRecordId: record.id },
        });
      }

      const abnormalities: CareAbnormality[] = [];
      for (const field of abnormalFields) {
        const abnormality = await tx.careAbnormality.create({
          data: {
            tenantId: this.ctx.tenantId!,
            storeId,
            careRecordId: record.id,
            fieldId: field.id,
            targetType: template.targetType,
            motherProfileId: dto.motherProfileId,
            babyProfileId: dto.babyProfileId,
            occurredAt: new Date(dto.occurredAt),
            fieldValue: dto.values[field.code] as any,
            createdBy: this.ctx.accountId!,
          },
        });
        abnormalities.push(abnormality);
      }
      return { record, abnormalities };
    });

    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'CareRecord',
      entityId: created.record.id,
      afterData: created,
      remark: dto.correctionOfId
        ? `更正记录，原记录 ${dto.correctionOfId}`
        : dto.isBackfilled
          ? `补录：${dto.backfillReason}`
          : undefined,
      ...this.auditCtx(),
    });
    for (const abnormality of created.abnormalities) {
      await this.auditLogService.record({
        action: 'CREATE',
        entityType: 'CareAbnormality',
        entityId: abnormality.id,
        afterData: abnormality,
        remark: '由护理记录自动触发',
        ...this.auditCtx(),
      });
    }

    const withIncludes = await this.findOneOrThrow(created.record.id);
    return { record: withIncludes as CareRecord, abnormalities: created.abnormalities };
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
