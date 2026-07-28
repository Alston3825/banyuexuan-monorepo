import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CareFormTemplate } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { CreateCareFormTemplateDto } from './dto/create-care-form-template.dto';
import { UpdateCareFormTemplateDto } from './dto/update-care-form-template.dto';
import { QueryCareFormTemplateDto } from './dto/query-care-form-template.dto';

const includeFields = {
  fields: { include: { field: true }, orderBy: { sortOrder: 'asc' as const } },
};

/**
 * 护理项目（表单模板）：字段绑定通过中间表维护，创建/替换字段列表都在事务里做，
 * 避免出现"模板存在但字段列表为空"的中间态。校验字段的 targetType 必须与模板一致，
 * 防止把"妈妈"字段挂到"宝宝"表单上。
 */
@Injectable()
export class CareFormTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  findMany(query: QueryCareFormTemplateDto = {}): Promise<CareFormTemplate[]> {
    return this.prisma.careFormTemplate.findMany({
      where: { tenantId: this.ctx.tenantId, targetType: query.targetType, department: query.department },
      include: includeFields,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneOrThrow(id: string) {
    const template = await this.prisma.careFormTemplate.findUnique({ where: { id }, include: includeFields });
    if (!template) throw new NotFoundException(`CareFormTemplate ${id} 不存在`);
    return template;
  }

  private async assertFieldsMatchTarget(fieldIds: string[], targetType: string) {
    const fields = await this.prisma.careFieldDefinition.findMany({ where: { id: { in: fieldIds } } });
    if (fields.length !== new Set(fieldIds).size) {
      throw new BadRequestException('存在不存在的护理字段 ID');
    }
    const mismatched = fields.find((f) => f.targetType !== targetType);
    if (mismatched) {
      throw new BadRequestException(`字段「${mismatched.name}」的适用对象与表单不一致`);
    }
  }

  async create(dto: CreateCareFormTemplateDto) {
    await this.assertFieldsMatchTarget(
      dto.fields.map((f) => f.fieldId),
      dto.targetType,
    );
    const created = await this.prisma.$transaction(async (tx) => {
      const template = await tx.careFormTemplate.create({
        data: {
          tenantId: this.ctx.tenantId!,
          code: dto.code,
          name: dto.name,
          targetType: dto.targetType,
          department: dto.department,
          scene: dto.scene,
          createdBy: this.ctx.accountId!,
        },
      });
      await tx.careFormTemplateField.createMany({
        data: dto.fields.map((f) => ({
          formTemplateId: template.id,
          fieldId: f.fieldId,
          required: f.required ?? false,
          sortOrder: f.sortOrder ?? 0,
        })),
      });
      return template;
    });
    const withFields = await this.findOneOrThrow(created.id);
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'CareFormTemplate',
      entityId: created.id,
      afterData: withFields,
      ...this.auditCtx(),
    });
    return withFields;
  }

  async update(id: string, dto: UpdateCareFormTemplateDto) {
    const before = await this.findOneOrThrow(id);
    if (before.version !== dto.version) {
      throw new ConflictException('数据已被他人修改，请刷新后重试');
    }
    if (dto.fields) {
      await this.assertFieldsMatchTarget(
        dto.fields.map((f) => f.fieldId),
        before.targetType,
      );
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const template = await tx.careFormTemplate.update({
        where: { id },
        data: {
          name: dto.name,
          scene: dto.scene,
          status: dto.status,
          version: { increment: 1 },
        },
      });
      if (dto.fields) {
        await tx.careFormTemplateField.deleteMany({ where: { formTemplateId: id } });
        await tx.careFormTemplateField.createMany({
          data: dto.fields.map((f) => ({
            formTemplateId: id,
            fieldId: f.fieldId,
            required: f.required ?? false,
            sortOrder: f.sortOrder ?? 0,
          })),
        });
      }
      return template;
    });
    const withFields = await this.findOneOrThrow(updated.id);
    await this.auditLogService.record({
      action: 'UPDATE',
      entityType: 'CareFormTemplate',
      entityId: id,
      beforeData: before,
      afterData: withFields,
      changedFields: Object.keys(dto).filter((k) => k !== 'version'),
      ...this.auditCtx(),
    });
    return withFields;
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
