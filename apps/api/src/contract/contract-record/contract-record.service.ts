import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Contract, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { ActorContext } from '../../common/context/actor-context';
import { generateBusinessNo } from '../../common/utils/business-no.util';
import { CustomerService } from '../../crm/customer/customer.service';
import { WorkflowEngineService } from '../../workflow/workflow-engine/workflow-engine.service';
import { QueryContractDto } from './dto/query-contract.dto';
import { RenewContractDto } from './dto/renew-contract.dto';

const DEFINITION_CODE = 'CONTRACT_SIGNING';
const BUSINESS_TYPE = 'CONTRACT';

/**
 * 合同：租户全局可见，不做门店级数据隔离（同 CustomerService，已与业务方确认）。
 * 状态机：DRAFT -(签署锁定)-> DRAFT(已签署) -(提交)-> PENDING_APPROVAL
 *        -(通用工作流引擎审批)-> ACTIVE/REJECTED；DRAFT/ACTIVE 可 VOIDED。
 * PENDING_APPROVAL 的后续推进（ACTIVE/REJECTED/退回 DRAFT）由 reconcileStatus()
 * 在读取时懒同步自 WorkflowInstance，不侵入通用工作流引擎本身，避免和
 * WorkflowEngineModule 之间产生循环依赖。
 */
@Injectable()
export class ContractRecordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerService: CustomerService,
    private readonly workflowEngineService: WorkflowEngineService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  async findMany(query: QueryContractDto): Promise<Contract[]> {
    const where: Prisma.ContractWhereInput = {
      tenantId: this.ctx.tenantId,
      customerId: query.customerId,
      storeId: query.storeId,
      status: query.status,
      renewalOfContractId:
        query.renewalOfContractId ??
        (query.isRenewal ? { not: null } : undefined),
    };
    const contracts = await this.prisma.contract.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(contracts.map((c) => this.reconcileStatus(c)));
  }

  async findOneOrThrow(id: string): Promise<Contract> {
    const contract = await this.prisma.contract.findUnique({ where: { id } });
    if (!contract) throw new NotFoundException(`Contract ${id} 不存在`);
    return this.reconcileStatus(contract);
  }

  async create(data: {
    customerId: string;
    opportunityId?: string;
    templateId?: string;
    storeId: string;
    title: string;
    content: string;
    amount: number;
    startDate: string;
    endDate: string;
  }): Promise<Contract> {
    await this.customerService.findOneOrThrow(data.customerId);
    const created = await this.prisma.contract.create({
      data: {
        ...data,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        contractNo: generateBusinessNo('CT'),
        status: 'DRAFT',
        tenantId: this.ctx.tenantId!,
        createdBy: this.ctx.accountId!,
      },
    });
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'Contract',
      entityId: created.id,
      afterData: created,
      ...this.auditCtx(),
    });
    return created;
  }

  async update(
    id: string,
    data: {
      title?: string;
      content?: string;
      amount?: number;
      startDate?: string;
      endDate?: string;
    },
    expectedVersion: number,
  ): Promise<Contract> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (before.status !== 'DRAFT' || before.signedByCustomerAt) {
      throw new BadRequestException(
        '合同已签署或不处于草稿状态，不能再编辑内容',
      );
    }
    const updated = await this.prisma.contract.update({
      where: { id },
      data: {
        ...data,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        version: { increment: 1 },
      },
    });
    await this.auditLogService.record({
      action: 'UPDATE',
      entityType: 'Contract',
      entityId: id,
      beforeData: before,
      afterData: updated,
      changedFields: Object.keys(data),
      ...this.auditCtx(),
    });
    return updated;
  }

  /** 客户确认签署：内容自此锁定，update() 不再允许调用。 */
  async sign(id: string, expectedVersion: number): Promise<Contract> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (before.status !== 'DRAFT' || before.signedByCustomerAt) {
      throw new BadRequestException('合同不处于「待签署」状态');
    }
    const updated = await this.prisma.contract.update({
      where: { id },
      data: {
        signedByCustomerAt: new Date(),
        signedByCustomerIp: this.ctx.ip,
        version: { increment: 1 },
      },
    });
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'Contract',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: '客户确认签署',
      ...this.auditCtx(),
    });
    return updated;
  }

  /** 提交内部签约审核：仅允许已签署的草稿合同。 */
  async submit(id: string, expectedVersion: number): Promise<Contract> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (before.status !== 'DRAFT' || !before.signedByCustomerAt) {
      throw new BadRequestException('合同需先完成客户签署才能提交审核');
    }
    await this.workflowEngineService.startInstance(
      {
        definitionCode: DEFINITION_CODE,
        businessType: BUSINESS_TYPE,
        businessId: id,
        title: before.title,
        storeId: before.storeId,
      },
      this.actor(),
    );
    const updated = await this.prisma.contract.update({
      where: { id },
      data: { status: 'PENDING_APPROVAL', version: { increment: 1 } },
    });
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'Contract',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: 'DRAFT -> PENDING_APPROVAL',
      ...this.auditCtx(),
    });
    return updated;
  }

  async void(
    id: string,
    voidReason: string,
    expectedVersion: number,
  ): Promise<Contract> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (!['DRAFT', 'ACTIVE'].includes(before.status)) {
      throw new BadRequestException(
        `合同当前状态「${before.status}」不允许作废`,
      );
    }
    const updated = await this.prisma.contract.update({
      where: { id },
      data: { status: 'VOIDED', voidReason, version: { increment: 1 } },
    });
    await this.auditLogService.record({
      action: 'VOID',
      entityType: 'Contract',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: voidReason,
      ...this.auditCtx(),
    });
    return updated;
  }

  /** 续签：新建一条关联到原合同的合同记录，原合同不做任何修改（只校验 version 防止基于过期数据续签）。 */
  async renew(id: string, dto: RenewContractDto): Promise<Contract> {
    const original = await this.findOneOrThrow(id);
    this.assertVersion(original, dto.version);
    if (original.status !== 'ACTIVE') {
      throw new BadRequestException('只有生效中的合同才能续签');
    }
    const created = await this.prisma.contract.create({
      data: {
        tenantId: original.tenantId,
        contractNo: generateBusinessNo('CT'),
        customerId: original.customerId,
        opportunityId: original.opportunityId,
        templateId: original.templateId,
        storeId: original.storeId,
        title: original.title,
        content: dto.content ?? original.content,
        amount: dto.amount ?? original.amount,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        status: 'DRAFT',
        renewalOfContractId: original.id,
        createdBy: this.ctx.accountId!,
      },
    });
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'Contract',
      entityId: created.id,
      afterData: created,
      remark: `续签自 ${original.id}`,
      ...this.auditCtx(),
    });
    return created;
  }

  /** 只要合同还停在 PENDING_APPROVAL，就查一下挂在它身上的 WorkflowInstance，按其终态推进合同状态。 */
  private async reconcileStatus(contract: Contract): Promise<Contract> {
    if (contract.status !== 'PENDING_APPROVAL') return contract;
    const instance = await this.prisma.workflowInstance.findFirst({
      where: { businessType: BUSINESS_TYPE, businessId: contract.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!instance) return contract;

    let nextStatus: 'ACTIVE' | 'REJECTED' | 'DRAFT' | null = null;
    if (instance.status === 'APPROVED' || instance.status === 'ARCHIVED')
      nextStatus = 'ACTIVE';
    else if (instance.status === 'REJECTED') nextStatus = 'REJECTED';
    else if (instance.status === 'WITHDRAWN') nextStatus = 'DRAFT';
    if (!nextStatus) return contract;

    const updated = await this.prisma.contract.update({
      where: { id: contract.id },
      data: { status: nextStatus, version: { increment: 1 } },
    });
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'Contract',
      entityId: contract.id,
      beforeData: contract,
      afterData: updated,
      remark: `PENDING_APPROVAL -> ${nextStatus}（同步自 WorkflowInstance ${instance.id}）`,
      ...this.auditCtx(),
    });
    return updated;
  }

  private assertVersion(before: Contract, expectedVersion: number): void {
    if (before.version !== expectedVersion) {
      throw new ConflictException('数据已被他人修改，请刷新后重试');
    }
  }

  private actor(): ActorContext {
    return {
      accountId: this.ctx.accountId,
      tenantId: this.ctx.tenantId,
      storeId: this.ctx.homeStoreId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    };
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
