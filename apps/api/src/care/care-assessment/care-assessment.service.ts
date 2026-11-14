import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { runVersionedUpdate } from '../../common/utils/versioned-update.util';
import { toDbData } from './assessment-codec';
import { ASSESSMENT_TYPES, AssessmentType, FORM_SPECS, FormSpec } from './assessment-specs';

interface Delegate {
  findUnique(args: unknown): Promise<Record<string, any> | null>;
  create(args: unknown): Promise<Record<string, any>>;
  update(args: unknown): Promise<Record<string, any>>;
}

const withDoc = { document: { include: { files: { orderBy: { sortOrder: 'asc' as const }, select: { id: true, fileName: true, mimeType: true } } } } };

/**
 * 四张"单次评估"表（产妇入住评估单、新生儿入所评估、妈妈出所评估、宝宝出所评估）的统一读写。
 * 字段全部由 assessment-specs 说明书驱动；每个妈妈/宝宝档案每种评估最多一份，可修改（乐观锁 + 审计留痕）。
 */
@Injectable()
export class CareAssessmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  specs(): FormSpec[] {
    return ASSESSMENT_TYPES.map((t) => FORM_SPECS[t]);
  }

  static specOf(type: string): FormSpec {
    const spec = FORM_SPECS[type as AssessmentType];
    if (!spec) throw new NotFoundException(`未知的评估表类型：${type}`);
    return spec;
  }

  private delegate(spec: FormSpec): Delegate {
    return (this.prisma as unknown as Record<string, Delegate>)[spec.model];
  }

  private fkOf(spec: FormSpec): 'motherProfileId' | 'babyProfileId' {
    return spec.subject === 'MOTHER' ? 'motherProfileId' : 'babyProfileId';
  }

  /** 妈妈档案下的全部评估：妈妈入住/出所各一份，每个宝宝入所/出所各一份。档案页的“评估”标签用。 */
  async overview(motherProfileId: string) {
    const mother = await this.prisma.motherProfile.findFirst({
      where: { id: motherProfileId, tenantId: this.ctx.tenantId },
      include: { babies: { orderBy: { sequenceNo: 'asc' } } },
    });
    if (!mother) throw new NotFoundException('母婴档案不存在');
    const get = (spec: FormSpec, profileId: string) => this.delegate(spec).findUnique({ where: { [this.fkOf(spec)]: profileId }, include: withDoc });
    const [motherAdmission, motherDischarge] = await Promise.all([get(FORM_SPECS.MOTHER_ADMISSION, mother.id), get(FORM_SPECS.MOTHER_DISCHARGE, mother.id)]);
    const babies = await Promise.all(
      mother.babies.map(async (b) => {
        const [admission, discharge] = await Promise.all([get(FORM_SPECS.BABY_ADMISSION, b.id), get(FORM_SPECS.BABY_DISCHARGE, b.id)]);
        return { baby: { id: b.id, sequenceNo: b.sequenceNo, name: b.name, gender: b.gender, birthDate: b.birthDate }, admission, discharge };
      }),
    );
    return { motherProfileId: mother.id, motherAdmission, motherDischarge, babies };
  }

  /** 校验档案存在并属于当前租户，返回门店。 */
  private async resolveProfile(spec: FormSpec, profileId: string): Promise<{ storeId: string }> {
    const p =
      spec.subject === 'MOTHER'
        ? await this.prisma.motherProfile.findFirst({ where: { id: profileId, tenantId: this.ctx.tenantId }, select: { storeId: true } })
        : await this.prisma.babyProfile.findFirst({ where: { id: profileId, tenantId: this.ctx.tenantId }, select: { storeId: true } });
    if (!p) throw new NotFoundException(spec.subject === 'MOTHER' ? '妈妈档案不存在' : '宝宝档案不存在');
    return p;
  }

  /** 关联的纸质原件必须是同一份档案、同类型的资料。 */
  private async assertDocument(spec: FormSpec, profileId: string, documentId: string): Promise<void> {
    const doc = await this.prisma.careDocument.findFirst({ where: { id: documentId, tenantId: this.ctx.tenantId } });
    if (!doc) throw new BadRequestException('关联的纸质资料不存在');
    if (doc.docType !== spec.type) throw new BadRequestException('关联的纸质资料类型和这张评估表不一致');
    const owner = spec.subject === 'MOTHER' ? doc.motherProfileId : doc.babyProfileId;
    if (owner !== profileId) throw new BadRequestException('关联的纸质资料不属于这个档案');
  }

  async create(type: string, dto: { profileId: string; documentId?: string; values: Record<string, unknown> }) {
    const spec = CareAssessmentService.specOf(type);
    const { storeId } = await this.resolveProfile(spec, dto.profileId);
    const fk = this.fkOf(spec);
    const existing = await this.delegate(spec).findUnique({ where: { [fk]: dto.profileId } });
    if (existing) throw new ConflictException(`该档案已有一份「${spec.title}」，请直接修改，不要重复新建`);
    if (dto.documentId) await this.assertDocument(spec, dto.profileId, dto.documentId);
    const data = toDbData(spec, dto.values);

    const created = await this.delegate(spec).create({
      data: { ...data, tenantId: this.ctx.tenantId, storeId, [fk]: dto.profileId, documentId: dto.documentId ?? null, createdBy: this.ctx.accountId },
      include: withDoc,
    });
    if (dto.documentId) await this.confirmDocument(dto.documentId);
    await this.syncBabyProfile(spec, dto.profileId, created);
    await this.audit('CREATE', spec, created.id, null, created);
    return created;
  }

  async update(type: string, id: string, dto: { version: number; documentId?: string | null; values: Record<string, unknown> }) {
    const spec = CareAssessmentService.specOf(type);
    const fk = this.fkOf(spec);
    const before = await this.delegate(spec).findUnique({ where: { id } });
    if (!before || before.tenantId !== this.ctx.tenantId) throw new NotFoundException(`${spec.title}不存在`);
    if (before.version !== dto.version) throw new ConflictException('数据已被他人修改，请刷新后重试');
    if (dto.documentId) await this.assertDocument(spec, before[fk], dto.documentId);
    const data = toDbData(spec, dto.values);

    const updated = await runVersionedUpdate(() =>
      this.delegate(spec).update({
        where: { id, version: dto.version },
        data: { ...data, ...(dto.documentId !== undefined ? { documentId: dto.documentId } : {}), version: { increment: 1 } },
        include: withDoc,
      }),
    );
    if (dto.documentId) await this.confirmDocument(dto.documentId);
    await this.syncBabyProfile(spec, before[fk], updated);
    await this.audit('UPDATE', spec, id, before, updated, Object.keys(data));
    return updated;
  }

  /** 新生儿入所评估里的出生日期/出生体重，宝宝档案里还是空的就自动填进去（已经有的不覆盖，免得冲掉人工改过的）。 */
  private async syncBabyProfile(spec: FormSpec, babyProfileId: string, row: Record<string, unknown>): Promise<void> {
    if (spec.type !== 'BABY_ADMISSION') return;
    const baby = await this.prisma.babyProfile.findFirst({ where: { id: babyProfileId, tenantId: this.ctx.tenantId }, select: { birthDate: true, birthWeightGrams: true } });
    if (!baby) return;
    const data: { birthDate?: Date; birthWeightGrams?: number } = {};
    if (!baby.birthDate && row.birthDate instanceof Date) data.birthDate = row.birthDate;
    if (!baby.birthWeightGrams && typeof row.birthWeightG === 'number') data.birthWeightGrams = row.birthWeightG;
    if (Object.keys(data).length) await this.prisma.babyProfile.update({ where: { id: babyProfileId }, data });
  }

  /** 评估表入库后，对应的纸质资料标记为"已确认"（不再是待复核草稿）。 */
  private async confirmDocument(documentId: string): Promise<void> {
    await this.prisma.careDocument.updateMany({
      where: { id: documentId, tenantId: this.ctx.tenantId, status: 'DRAFT' },
      data: { status: 'CONFIRMED', confirmedBy: this.ctx.accountId, confirmedAt: new Date() },
    });
  }

  private async audit(action: 'CREATE' | 'UPDATE', spec: FormSpec, id: string, before: unknown, after: unknown, changedFields?: string[]) {
    await this.auditLogService.record({
      action,
      entityType: spec.model,
      entityId: id,
      beforeData: before ?? undefined,
      afterData: after,
      changedFields,
      remark: spec.title,
      tenantId: this.ctx.tenantId,
      storeId: this.ctx.homeStoreId,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    });
  }
}
