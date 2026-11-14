import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { runVersionedUpdate } from '../../common/utils/versioned-update.util';
import { toDbData } from '../care-assessment/assessment-codec';
import { FormSpec } from '../care-assessment/assessment-specs';
import { MED_HEADER_FIELDS, MED_ITEM_COLUMNS } from './medication-specs';

const headerSpec = { groups: [{ title: '表头', fields: MED_HEADER_FIELDS }] } as unknown as FormSpec;
const itemSpec = { groups: [{ title: '药品', fields: MED_ITEM_COLUMNS }] } as unknown as FormSpec;

export interface MedicationDto {
  motherProfileId?: string;
  babyProfileId?: string;
  /** 变更：基于哪一份委托书新签（上一份自动变成“已替换”） */
  previousAuthId?: string;
  changeNote?: string;
  documentId?: string | null;
  version?: number;
  header: Record<string, unknown>;
  items: Record<string, unknown>[];
}

const include = {
  items: { orderBy: { sortOrder: 'asc' as const } },
  document: { select: { id: true, status: true, files: { orderBy: { sortOrder: 'asc' as const }, select: { id: true, fileName: true, mimeType: true } } } },
  babyProfile: { select: { id: true, sequenceNo: true, name: true, gender: true } },
};

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * 新生儿用药委托书：每次委托一份（含多种药品），变更时新签一份并指向上一份（上一份自动变“已替换”），
 * 停药则标记“已停药”；每份都保留家属签字的纸质原件照片，完整记录用药委托的变化过程，用来分清责任。
 * 日常护理记录里的“用药”一栏会按当天仍有效的委托书给出可选药品，并提示没有委托书的用药。
 */
@Injectable()
export class CareMedicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  specs() {
    return { header: MED_HEADER_FIELDS, item: MED_ITEM_COLUMNS };
  }

  list(query: { motherProfileId?: string; babyProfileId?: string }) {
    return this.prisma.careMedicationAuth.findMany({
      where: { tenantId: this.ctx.tenantId, motherProfileId: query.motherProfileId, babyProfileId: query.babyProfileId },
      include,
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  private async getOrThrow(id: string) {
    const a = await this.prisma.careMedicationAuth.findFirst({ where: { id, tenantId: this.ctx.tenantId }, include });
    if (!a) throw new NotFoundException('用药委托书不存在');
    return a;
  }

  /** 某天仍有效的用药（按宝宝分组），日常护理记录里选药和核对用。 */
  async activeItems(babyIds: string[], date: string) {
    if (babyIds.length === 0) return {} as Record<string, { authId: string; drugName: string; route: string | null; times: unknown; dose: string | null }[]>;
    const auths = await this.prisma.careMedicationAuth.findMany({
      where: { tenantId: this.ctx.tenantId, babyProfileId: { in: babyIds }, status: 'ACTIVE' },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    const out: Record<string, { authId: string; drugName: string; route: string | null; times: unknown; dose: string | null }[]> = {};
    for (const a of auths) {
      if (a.medicationStart && ymd(a.medicationStart) > date) continue;
      for (const it of a.items) {
        if (it.startDate && ymd(it.startDate) > date) continue;
        if (it.endDate && ymd(it.endDate) < date) continue;
        (out[a.babyProfileId] ??= []).push({ authId: a.id, drugName: it.drugName, route: it.route, times: it.times, dose: it.dose });
      }
    }
    return out;
  }

  private parseItems(rows: Record<string, unknown>[]) {
    const items = (rows ?? []).map((r, i) => {
      const data = toDbData(itemSpec, r);
      if (!data.drugName) throw new BadRequestException(`第 ${i + 1} 行药品没有填药名`);
      return { ...data, sortOrder: i } as unknown as Record<string, unknown> & { drugName: string };
    });
    if (items.length === 0) throw new BadRequestException('请至少填写一种药品');
    return items;
  }

  private async assertDocument(docId: string, babyProfileId: string) {
    const doc = await this.prisma.careDocument.findFirst({ where: { id: docId, tenantId: this.ctx.tenantId } });
    if (!doc || doc.docType !== 'MEDICATION_AUTH' || doc.babyProfileId !== babyProfileId) throw new BadRequestException('关联的纸质资料不存在，或不是这个宝宝的用药委托书');
  }

  private async confirmDoc(docId: string) {
    await this.prisma.careDocument.updateMany({
      where: { id: docId, tenantId: this.ctx.tenantId, status: 'DRAFT' },
      data: { status: 'CONFIRMED', confirmedBy: this.ctx.accountId, confirmedAt: new Date() },
    });
  }

  async create(dto: MedicationDto) {
    if (!dto.babyProfileId) throw new BadRequestException('请选择宝宝');
    const baby = await this.prisma.babyProfile.findFirst({ where: { id: dto.babyProfileId, tenantId: this.ctx.tenantId } });
    if (!baby) throw new NotFoundException('宝宝档案不存在');
    if (dto.motherProfileId && dto.motherProfileId !== baby.motherProfileId) throw new BadRequestException('宝宝和妈妈档案不匹配');
    const header = toDbData(headerSpec, dto.header ?? {});
    const items = this.parseItems(dto.items);
    if (dto.documentId) await this.assertDocument(dto.documentId, baby.id);

    let previous: Awaited<ReturnType<CareMedicationService['getOrThrow']>> | null = null;
    if (dto.previousAuthId) {
      previous = await this.getOrThrow(dto.previousAuthId);
      if (previous.babyProfileId !== baby.id) throw new BadRequestException('上一份委托书不是这个宝宝的');
      if (previous.status !== 'ACTIVE') throw new ConflictException('上一份委托书已不是有效状态，不能再基于它变更');
      if (!dto.changeNote?.trim()) throw new BadRequestException('变更委托书请填写变更说明（相比上一份改了什么、为什么）');
    }
    const tenantId = this.ctx.tenantId!;
    const accountId = this.ctx.accountId!;
    const created = await this.prisma.$transaction(async (tx) => {
      if (previous) await tx.careMedicationAuth.update({ where: { id: previous.id }, data: { status: 'SUPERSEDED', version: { increment: 1 } } });
      return tx.careMedicationAuth.create({
        data: {
          ...header,
          tenantId,
          storeId: baby.storeId,
          motherProfileId: baby.motherProfileId,
          babyProfileId: baby.id,
          previousAuthId: previous?.id ?? null,
          changeNote: dto.changeNote?.trim() || null,
          documentId: dto.documentId ?? null,
          createdBy: accountId,
          items: { create: items.map((it) => ({ ...(it as object), tenantId }) as Prisma.CareMedicationItemCreateWithoutAuthInput) },
        },
        include,
      });
    });
    if (dto.documentId) await this.confirmDoc(dto.documentId);
    await this.audit(previous ? 'STATE_TRANSITION' : 'CREATE', created.id, baby.storeId, previous ? `变更用药委托书（替换 ${previous.id}）` : '新建用药委托书', { items: items.map((i) => i.drugName) });
    return created;
  }

  /** 修改（更正笔误）：只能改仍有效的委托书；已替换/已停药的是历史，不能改内容，只能补传签字原件。 */
  async update(id: string, dto: MedicationDto) {
    const before = await this.getOrThrow(id);
    if (dto.version !== before.version) throw new ConflictException('数据已被他人修改，请刷新后重试');
    const header = toDbData(headerSpec, dto.header ?? {});
    const touchesContent = Object.keys(dto.header ?? {}).length > 0 || (dto.items ?? []).length > 0;
    if (before.status !== 'ACTIVE' && touchesContent) throw new ConflictException('这份委托书已被替换或已停药，属于历史记录，不能修改内容；需要调整请新签一份');
    if (dto.documentId) await this.assertDocument(dto.documentId, before.babyProfileId);
    const items = (dto.items ?? []).length > 0 ? this.parseItems(dto.items) : null;

    await this.prisma.$transaction(async (tx) => {
      await runVersionedUpdate(() =>
        tx.careMedicationAuth.update({
          where: { id, version: before.version },
          data: {
            ...(before.status === 'ACTIVE' ? header : {}),
            ...(dto.changeNote !== undefined && before.status === 'ACTIVE' ? { changeNote: dto.changeNote?.trim() || null } : {}),
            ...(dto.documentId !== undefined ? { documentId: dto.documentId } : {}),
            version: { increment: 1 },
          },
        }),
      );
      if (items) {
        await tx.careMedicationItem.deleteMany({ where: { authId: id } });
        await tx.careMedicationItem.createMany({ data: items.map((it) => ({ ...(it as object), tenantId: this.ctx.tenantId!, authId: id }) as Prisma.CareMedicationItemCreateManyInput) });
      }
    });
    if (dto.documentId) await this.confirmDoc(dto.documentId);
    const after = await this.getOrThrow(id);
    await this.audit('UPDATE', id, before.storeId, '修改用药委托书', { before: before.items.map((i) => i.drugName), after: after.items.map((i) => i.drugName) });
    return after;
  }

  async stop(id: string, dto: { version: number; note: string }) {
    const before = await this.getOrThrow(id);
    if (dto.version !== before.version) throw new ConflictException('数据已被他人修改，请刷新后重试');
    if (before.status !== 'ACTIVE') throw new ConflictException('这份委托书已不是有效状态');
    if (!dto.note?.trim()) throw new BadRequestException('请填写停药原因/说明');
    await runVersionedUpdate(() =>
      this.prisma.careMedicationAuth.update({
        where: { id, version: before.version },
        data: { status: 'STOPPED', stoppedAt: new Date(), stoppedBy: this.ctx.accountId, stopNote: dto.note.trim(), version: { increment: 1 } },
      }),
    );
    await this.audit('STATE_TRANSITION', id, before.storeId, `停药：${dto.note.trim()}`, { items: before.items.map((i) => i.drugName) });
    return this.getOrThrow(id);
  }

  private audit(action: 'CREATE' | 'UPDATE' | 'STATE_TRANSITION', id: string, storeId: string, remark: string, data: unknown) {
    return this.auditLogService.record({
      action,
      entityType: 'CareMedicationAuth',
      entityId: id,
      afterData: data as Prisma.InputJsonValue,
      remark,
      tenantId: this.ctx.tenantId,
      storeId,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    });
  }
}
