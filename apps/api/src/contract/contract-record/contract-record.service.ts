import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Contract, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { generateBusinessNo } from '../../common/utils/business-no.util';
import { runVersionedUpdate } from '../../common/utils/versioned-update.util';
import { CustomerService } from '../../crm/customer/customer.service';
import { ContractStorageService } from '../contract-storage/contract-storage.service';
import { addDays, ContractExtractionService } from '../contract-extraction/contract-extraction.service';
import { QueryContractDto } from './dto/query-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { ConfirmContractDto } from './dto/confirm-contract.dto';
import { UpdateCustomerDto } from '../../crm/customer/dto/update-customer.dto';

const PLACEHOLDER_PHONES = new Set(['', '待补充']);
const ACTIVE_OCCUPANCY = ['RESERVED', 'CHECKED_IN'] as const;

export interface CustomerMatch {
  id: string;
  customerNo: string;
  name: string;
  phone: string;
  expectedDueDate: Date | null;
  reason: 'PHONE' | 'NAME';
}

/**
 * 合同 = 纸质合同的数据台账 + 原件存档（见 schema.prisma 里 Contract 的说明）。
 * 流程：上传原件 → AI 后台识别（ContractExtractionService）→ 销售在核对页修改/确认（confirm）→
 * 已确认的合同在"待排房"列表里等销售到房态图上排房（预订记录带 contractId）。
 * 没有电子签署、审批、模板、续签。租户全局可见，不做门店级数据隔离（同 Customer）。
 */
@Injectable()
export class ContractRecordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerService: CustomerService,
    private readonly storage: ContractStorageService,
    private readonly extraction: ContractExtractionService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  private readonly listInclude = {
    signer: { select: { id: true, realName: true } },
    roomType: { select: { id: true, name: true } },
    customer: { select: { id: true, name: true } },
    roomOccupancies: { where: { status: { not: 'CANCELLED' } }, select: { id: true, status: true, roomId: true } },
  } satisfies Prisma.ContractInclude;

  async findMany(query: QueryContractDto) {
    const where: Prisma.ContractWhereInput = {
      tenantId: this.ctx.tenantId,
      customerId: query.customerId,
      storeId: query.storeId,
      status: query.unassigned ? 'ACTIVE' : query.status,
    };
    if (query.unassigned) where.roomOccupancies = { none: { status: { not: 'CANCELLED' } } };
    if (query.keyword?.trim()) {
      const k = query.keyword.trim();
      where.OR = [
        { paperNo: { contains: k } },
        { contractNo: { contains: k } },
        { clientName: { contains: k } },
        { clientPhone: { contains: k } },
        { customer: { name: { contains: k } } },
      ];
    }
    return this.prisma.contract.findMany({
      where,
      include: this.listInclude,
      // 待排房按签单先后（先签的先排）；其余按上传时间倒序
      orderBy: query.unassigned ? [{ signedDate: 'asc' }, { createdAt: 'asc' }] : { createdAt: 'desc' },
    });
  }

  /** 仅取合同本体（收款等其它模块用）。 */
  async findOneOrThrow(id: string): Promise<Contract> {
    const contract = await this.prisma.contract.findFirst({ where: { id, tenantId: this.ctx.tenantId } });
    if (!contract) throw new NotFoundException(`合同 ${id} 不存在`);
    return contract;
  }

  async getDetail(id: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id, tenantId: this.ctx.tenantId },
      include: {
        ...this.listInclude,
        customer: { select: { id: true, name: true, phone: true, customerNo: true } },
        files: { orderBy: [{ kind: 'asc' }, { pageNo: 'asc' }, { createdAt: 'asc' }] },
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!contract) throw new NotFoundException(`合同 ${id} 不存在`);
    return contract;
  }

  // ---------------- 上传 / 手工新建 ----------------

  async createFromUpload(files: Express.Multer.File[], storeId?: string) {
    if (!files?.length) throw new BadRequestException('请选择合同文件（PDF 或照片）');
    for (const f of files) {
      const isPdf = f.buffer.subarray(0, 4).toString() === '%PDF';
      const isImage = /^image\/(jpeg|png|webp)$/.test(f.mimetype);
      if (!isPdf && !isImage) throw new BadRequestException(`文件「${this.fileName(f)}」不是 PDF 或 JPG/PNG 图片`);
    }
    const contract = await this.createBlank(storeId, 'PENDING');
    for (const f of files) {
      const name = this.fileName(f);
      const rel = await this.storage.save(contract.id, 'orig', `${Date.now()}-${name}`, f.buffer);
      await this.prisma.contractFile.create({
        data: {
          tenantId: contract.tenantId,
          contractId: contract.id,
          kind: 'ORIGINAL',
          fileName: name,
          storagePath: rel,
          mimeType: f.buffer.subarray(0, 4).toString() === '%PDF' ? 'application/pdf' : f.mimetype,
          sizeBytes: f.size,
          createdBy: this.ctx.accountId!,
        },
      });
    }
    this.extraction.enqueue(contract.id, contract.tenantId, this.ctx.accountId!);
    return this.getDetail(contract.id);
  }

  /** 没有原件（或想先录数据）时手工新建一份空白待核对合同。 */
  async createManual(storeId?: string) {
    const contract = await this.createBlank(storeId, 'NONE');
    return this.getDetail(contract.id);
  }

  private async createBlank(storeId: string | undefined, extractStatus: 'NONE' | 'PENDING') {
    const resolvedStore = storeId ?? this.ctx.homeStoreId;
    if (!resolvedStore) throw new BadRequestException('请选择门店');
    const created = await this.prisma.contract.create({
      data: {
        tenantId: this.ctx.tenantId!,
        contractNo: generateBusinessNo('CT'),
        storeId: resolvedStore,
        status: 'PENDING_REVIEW',
        extractStatus,
        signerId: this.ctx.accountId, // 签单人默认是上传合同的这位销售，核对页可改
        createdBy: this.ctx.accountId!,
      },
    });
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'Contract',
      entityId: created.id,
      afterData: created,
      remark: extractStatus === 'NONE' ? '手工新建合同' : '上传纸质合同',
      ...this.auditCtx(),
    });
    return created;
  }

  /** multer 把 UTF-8 文件名当 latin1 解码，中文会乱码，这里还原。 */
  private fileName(f: Express.Multer.File): string {
    return Buffer.from(f.originalname, 'latin1').toString('utf8');
  }

  async reextract(id: string) {
    const contract = await this.findOneOrThrow(id);
    if (contract.status !== 'PENDING_REVIEW') throw new BadRequestException('只有待核对的合同可以重新识别');
    if (['PENDING', 'RUNNING'].includes(contract.extractStatus)) throw new ConflictException('正在识别中，请稍候');
    const originals = await this.prisma.contractFile.count({ where: { contractId: id, kind: 'ORIGINAL' } });
    if (originals === 0) throw new BadRequestException('这份合同没有上传原件，无法识别');
    this.extraction.enqueue(id, contract.tenantId, this.ctx.accountId!);
    return this.getDetail(id);
  }

  // ---------------- 编辑（核对页保存） ----------------

  async update(id: string, dto: UpdateContractDto) {
    const { version, items, ...fields } = dto;
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, version);
    if (!['PENDING_REVIEW', 'ACTIVE'].includes(before.status)) throw new BadRequestException('已作废的合同不能再修改');
    if (['PENDING', 'RUNNING'].includes(before.extractStatus)) throw new ConflictException('AI 正在识别中，识别完成后再修改');

    const data: Prisma.ContractUncheckedUpdateInput = {};
    const plain = [
      'paperNo', 'signerId', 'clientName', 'clientPhone', 'clientIdCardNo', 'clientHospital', 'clientAddress',
      'emergencyName', 'emergencyRelation', 'emergencyPhone', 'fetus', 'roomTypeText', 'roomTypeId', 'orientation',
      'careMode', 'inHouseDays', 'homeServiceDays', 'daysText', 'amount', 'depositAmount', 'depositPaid', 'depositMethod',
    ] as const;
    for (const key of plain) {
      if (fields[key] !== undefined) (data as Record<string, unknown>)[key] = fields[key];
    }
    for (const key of ['signedDate', 'dueDate', 'estimatedCheckIn', 'estimatedCheckOut', 'depositPaidAt'] as const) {
      if (fields[key] !== undefined) (data as Record<string, unknown>)[key] = fields[key] ? new Date(fields[key]!) : null;
    }
    // 预估离店日期没有单独给时，随"预估入住日期 / 入住天数"的变化自动重算
    if (fields.estimatedCheckOut === undefined && (fields.estimatedCheckIn !== undefined || fields.inHouseDays !== undefined)) {
      const checkIn = fields.estimatedCheckIn !== undefined ? (fields.estimatedCheckIn ? new Date(fields.estimatedCheckIn) : null) : before.estimatedCheckIn;
      const days = fields.inHouseDays !== undefined ? fields.inHouseDays : before.inHouseDays;
      data.estimatedCheckOut = checkIn && days ? addDays(checkIn, days) : null;
    }
    if (fields.roomTypeText !== undefined && fields.roomTypeId === undefined) {
      data.roomTypeId = await this.extraction.matchRoomType(before.tenantId, fields.roomTypeText ?? null);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await runVersionedUpdate(() =>
        tx.contract.update({ where: { id, version }, data: { ...data, version: { increment: 1 } } }),
      );
      if (items) {
        await tx.contractItem.deleteMany({ where: { contractId: id } });
        const clean = items.filter((i) => i.name?.trim());
        if (clean.length > 0) {
          await tx.contractItem.createMany({
            data: clean.map((i, idx) => ({
              tenantId: before.tenantId,
              contractId: id,
              kind: 'GIFT' as const,
              name: i.name.trim(),
              quantity: i.quantity?.trim() || null,
              needsReview: i.needsReview ?? false,
              sortOrder: idx,
            })),
          });
        }
      }
      return row;
    });
    await this.auditLogService.record({
      action: 'UPDATE',
      entityType: 'Contract',
      entityId: id,
      beforeData: before,
      afterData: updated,
      changedFields: [...Object.keys(fields), ...(items ? ['items'] : [])],
      ...this.auditCtx(),
    });
    return this.getDetail(id);
  }

  // ---------------- 确认入库 ----------------

  /** 核对页里"关联已有客户 / 新建客户"的候选：手机号相同的、姓名相同的。 */
  async customerMatches(id: string): Promise<{ matches: CustomerMatch[]; suggestedId: string | null }> {
    const c = await this.findOneOrThrow(id);
    const select = { id: true, customerNo: true, name: true, phone: true, expectedDueDate: true } as const;
    const phone = c.clientPhone?.trim();
    const [byPhone, byName] = await Promise.all([
      phone && !PLACEHOLDER_PHONES.has(phone)
        ? this.prisma.customer.findMany({ where: { tenantId: c.tenantId, phone }, select, take: 10 })
        : Promise.resolve([]),
      c.clientName?.trim()
        ? this.prisma.customer.findMany({ where: { tenantId: c.tenantId, name: c.clientName.trim() }, select, take: 10 })
        : Promise.resolve([]),
    ]);
    const matches: CustomerMatch[] = [];
    for (const m of byPhone) matches.push({ ...m, reason: 'PHONE' });
    for (const m of byName) if (!matches.some((x) => x.id === m.id)) matches.push({ ...m, reason: 'NAME' });
    // 建议：手机号唯一命中，或只有一个同名客户（导入的老客户没有手机号，只能靠姓名对上）
    const phoneHits = matches.filter((m) => m.reason === 'PHONE');
    const suggestedId = phoneHits.length === 1 ? phoneHits[0].id : phoneHits.length === 0 && matches.length === 1 ? matches[0].id : null;
    return { matches, suggestedId };
  }

  async confirm(id: string, dto: ConfirmContractDto) {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, dto.version);
    if (before.status !== 'PENDING_REVIEW') throw new BadRequestException('只有待核对的合同可以确认');
    if (['PENDING', 'RUNNING'].includes(before.extractStatus)) throw new ConflictException('AI 正在识别中，识别完成后再确认');

    const missing: string[] = [];
    if (!before.clientName?.trim()) missing.push('客户姓名');
    if (!before.clientPhone?.trim()) missing.push('客户手机号');
    if (!before.paperNo?.trim()) missing.push('合同编号');
    if (!before.signedDate) missing.push('签约日期');
    if (!before.roomTypeId && !before.roomTypeText?.trim()) missing.push('房型');
    if (!before.careMode) missing.push('护理模式');
    if (!before.inHouseDays) missing.push('入住天数');
    if (!before.amount || before.amount <= 0) missing.push('套餐金额');
    if (missing.length > 0) throw new BadRequestException(`还有必填项没有填：${missing.join('、')}`);

    const customerId = await this.resolveCustomer(before, dto.customerId);

    const confirmed = await this.prisma.$transaction(async (tx) => {
      let depositPaymentId = before.depositPaymentId;
      if (before.depositPaid && before.depositAmount && before.depositAmount > 0 && !depositPaymentId) {
        const payment = await tx.payment.create({
          data: {
            tenantId: before.tenantId,
            paymentNo: generateBusinessNo('PY'),
            contractId: id,
            customerId,
            storeId: before.storeId,
            amount: before.depositAmount,
            method: before.depositMethod ?? 'CASH',
            status: 'RECORDED',
            remark: `合同定金（纸质合同 ${before.paperNo ?? before.contractNo}）`,
            createdBy: this.ctx.accountId!,
          },
        });
        depositPaymentId = payment.id;
      }
      return runVersionedUpdate(() =>
        tx.contract.update({
          where: { id, version: dto.version },
          data: {
            customerId,
            status: 'ACTIVE',
            confirmedAt: new Date(),
            confirmedById: this.ctx.accountId,
            depositPaymentId,
            version: { increment: 1 },
          },
        }),
      );
    });
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'Contract',
      entityId: id,
      beforeData: before,
      afterData: confirmed,
      remark: 'PENDING_REVIEW -> ACTIVE（核对确认）',
      ...this.auditCtx(),
    });
    return this.getDetail(id);
  }

  /** 确认时决定客户：指定了就关联并补全空缺信息；没指定就新建。 */
  private async resolveCustomer(c: Contract, chosenId?: string): Promise<string> {
    const signerId = c.signerId ?? this.ctx.accountId;
    const dueDateIso = c.dueDate ? c.dueDate.toISOString().slice(0, 10) : undefined;
    if (!chosenId) {
      const created = await this.customerService.create({
        allowDuplicatePhone: true, // 用户在确认弹窗里主动选了"新建客户"，不再按手机号拦
        name: c.clientName!.trim(),
        phone: c.clientPhone!.trim(),
        source: 'OTHER',
        primaryStoreId: c.storeId,
        assignedToId: signerId ?? undefined,
        hospital: c.clientHospital ?? undefined,
        address: c.clientAddress ?? undefined,
        expectedDueDate: dueDateIso,
        idCardNo: c.clientIdCardNo ?? undefined,
        emergencyContactName: c.emergencyName ?? undefined,
        emergencyContactRelation: c.emergencyRelation ?? undefined,
        emergencyContactPhone: c.emergencyPhone ?? undefined,
      });
      return created.id;
    }
    const customer = await this.customerService.findOneOrThrow(chosenId);
    // 只补空缺，不覆盖客户档案里已有的信息
    // 合同上的号码是用户在核对页确认过的，即使和其他客户重复（二胎/家人共用号码）也放行
    const patch: Omit<UpdateCustomerDto, 'version'> = { allowDuplicatePhone: true };
    const blank = (v: string | null | undefined) => !v || !v.trim();
    if (PLACEHOLDER_PHONES.has(customer.phone.trim()) && c.clientPhone && /^1[3-9]\d{9}$/.test(c.clientPhone)) patch.phone = c.clientPhone;
    if (blank(customer.idCardNo) && c.clientIdCardNo) patch.idCardNo = c.clientIdCardNo;
    if (blank(customer.hospital) && c.clientHospital) patch.hospital = c.clientHospital;
    if (blank(customer.address) && c.clientAddress) patch.address = c.clientAddress;
    if (!customer.expectedDueDate && dueDateIso) patch.expectedDueDate = dueDateIso;
    if (blank(customer.emergencyContactName) && c.emergencyName) patch.emergencyContactName = c.emergencyName;
    if (blank(customer.emergencyContactRelation) && c.emergencyRelation) patch.emergencyContactRelation = c.emergencyRelation;
    if (blank(customer.emergencyContactPhone) && c.emergencyPhone) patch.emergencyContactPhone = c.emergencyPhone;
    if (!customer.assignedToId && signerId) patch.assignedToId = signerId;
    if (Object.keys(patch).length > 1) await this.customerService.update(customer.id, patch, customer.version);
    return customer.id;
  }

  // ---------------- 作废 / 删除 ----------------

  async void(id: string, voidReason: string, expectedVersion: number) {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (!['PENDING_REVIEW', 'ACTIVE'].includes(before.status)) {
      throw new BadRequestException(`合同当前状态「${before.status}」不允许作废`);
    }
    const active = await this.prisma.roomOccupancy.count({ where: { contractId: id, status: { in: [...ACTIVE_OCCUPANCY] } } });
    if (active > 0) throw new ConflictException('这份合同已经排了房（有未结束的预订/入住），请先取消预订或办理离店，再作废合同');
    const updated = await runVersionedUpdate(() =>
      this.prisma.contract.update({ where: { id, version: expectedVersion }, data: { status: 'VOIDED', voidReason, version: { increment: 1 } } }),
    );
    await this.auditLogService.record({
      action: 'VOID',
      entityType: 'Contract',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: voidReason,
      ...this.auditCtx(),
    });
    return this.getDetail(id);
  }

  /** 只允许删除还没确认的合同（传错了/测试用的），已确认的合同只能作废。 */
  async remove(id: string): Promise<void> {
    const before = await this.findOneOrThrow(id);
    if (before.status !== 'PENDING_REVIEW') throw new ConflictException('已确认的合同不能删除，只能作废');
    if (['PENDING', 'RUNNING'].includes(before.extractStatus)) throw new ConflictException('AI 正在识别中，请稍后再删除');
    await this.prisma.contract.delete({ where: { id } });
    await this.storage.removeContractDir(id);
    await this.auditLogService.record({ action: 'DELETE', entityType: 'Contract', entityId: id, beforeData: before, ...this.auditCtx() });
  }

  // ---------------- 原件 ----------------

  async openFile(contractId: string, fileId: string) {
    await this.findOneOrThrow(contractId);
    const file = await this.prisma.contractFile.findFirst({ where: { id: fileId, contractId } });
    if (!file) throw new NotFoundException('文件不存在');
    const { stream, size } = await this.storage.readStream(file.storagePath);
    return { stream, size, mimeType: file.mimeType, fileName: file.fileName };
  }

  private assertVersion(before: Contract, expectedVersion: number): void {
    if (before.version !== expectedVersion) throw new ConflictException('数据已被他人修改（或 AI 刚识别完成），请刷新后重试');
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
