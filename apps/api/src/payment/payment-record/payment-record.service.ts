import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Payment, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { ActorContext } from '../../common/context/actor-context';
import { generateBusinessNo } from '../../common/utils/business-no.util';
import { CustomerService } from '../../crm/customer/customer.service';
import { ContractRecordService } from '../../contract/contract-record/contract-record.service';
import { WorkflowEngineService } from '../../workflow/workflow-engine/workflow-engine.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { QueryPaymentDto } from './dto/query-payment.dto';

const DEFINITION_CODE = 'PAYMENT_REFUND';
const BUSINESS_TYPE = 'PAYMENT';

export interface PaymentContractSummary {
  contractId: string;
  contractAmount: number;
  totalCollected: number;
  totalRefunded: number;
  balance: number;
}

/**
 * 收款：只做"收款"（客户付钱给中心），不做应付/付款。
 * 状态机：RECORDED -(申请退款)-> PENDING_REFUND -(通用工作流引擎审批)-> REFUNDED；
 *        审批驳回/撤回则退回 RECORDED。退款不新增独立冲正单据，是同一条记录上的状态
 *        迁移（与 Contract.void() 处理口径一致），为控制本轮范围做的取舍。
 * PENDING_REFUND 的后续推进由 reconcileStatus() 在读取时懒同步自 WorkflowInstance，
 * 完全仿照 ContractRecordService 的写法。
 */
@Injectable()
export class PaymentRecordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerService: CustomerService,
    private readonly contractRecordService: ContractRecordService,
    private readonly workflowEngineService: WorkflowEngineService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  async findMany(query: QueryPaymentDto): Promise<Payment[]> {
    const where: Prisma.PaymentWhereInput = {
      tenantId: this.ctx.tenantId,
      contractId: query.contractId,
      customerId: query.customerId,
      storeId: query.storeId,
      status: query.status,
    };
    const payments = await this.prisma.payment.findMany({ where, orderBy: { createdAt: 'desc' } });
    return Promise.all(payments.map((p) => this.reconcileStatus(p)));
  }

  async findOneOrThrow(id: string): Promise<Payment> {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException(`Payment ${id} 不存在`);
    return this.reconcileStatus(payment);
  }

  async create(dto: CreatePaymentDto): Promise<Payment> {
    await this.contractRecordService.findOneOrThrow(dto.contractId);
    await this.customerService.findOneOrThrow(dto.customerId);
    const created = await this.prisma.payment.create({
      data: {
        contractId: dto.contractId,
        customerId: dto.customerId,
        storeId: dto.storeId,
        amount: dto.amount,
        method: dto.method ?? 'CASH',
        remark: dto.remark,
        paymentNo: generateBusinessNo('PY'),
        status: 'RECORDED',
        tenantId: this.ctx.tenantId!,
        createdBy: this.ctx.accountId!,
      },
    });
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'Payment',
      entityId: created.id,
      afterData: created,
      ...this.auditCtx(),
    });
    return created;
  }

  /** 申请退款：仅允许从 RECORDED 迁移，提交后进入通用工作流引擎审批。 */
  async requestRefund(id: string, refundReason: string, expectedVersion: number): Promise<Payment> {
    const before = await this.findOneOrThrow(id);
    this.assertVersion(before, expectedVersion);
    if (before.status !== 'RECORDED') {
      throw new BadRequestException(`收款记录当前状态「${before.status}」不允许申请退款`);
    }
    await this.workflowEngineService.startInstance(
      {
        definitionCode: DEFINITION_CODE,
        businessType: BUSINESS_TYPE,
        businessId: id,
        title: `收款 ${before.paymentNo} 退款申请`,
        storeId: before.storeId,
      },
      this.actor(),
    );
    const updated = await this.prisma.payment.update({
      where: { id },
      data: { status: 'PENDING_REFUND', refundReason, version: { increment: 1 } },
    });
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'Payment',
      entityId: id,
      beforeData: before,
      afterData: updated,
      remark: 'RECORDED -> PENDING_REFUND',
      ...this.auditCtx(),
    });
    return updated;
  }

  /** 计算式合同收款汇总：不落库任何冗余汇总字段，延续房态看板的"计算优于冗余存储"原则。 */
  async getContractSummary(contractId: string): Promise<PaymentContractSummary> {
    const contract = await this.contractRecordService.findOneOrThrow(contractId);
    const payments = await this.prisma.payment.findMany({ where: { tenantId: this.ctx.tenantId, contractId } });
    const reconciled = await Promise.all(payments.map((p) => this.reconcileStatus(p)));

    // PENDING_REFUND 期间钱还没退，仍计入已收金额；只有真正 REFUNDED 才移出已收、计入已退。
    const totalCollected = reconciled
      .filter((p) => p.status === 'RECORDED' || p.status === 'PENDING_REFUND')
      .reduce((sum, p) => sum + p.amount, 0);
    const totalRefunded = reconciled.filter((p) => p.status === 'REFUNDED').reduce((sum, p) => sum + p.amount, 0);

    return {
      contractId,
      contractAmount: contract.amount,
      totalCollected,
      totalRefunded,
      balance: contract.amount - totalCollected,
    };
  }

  /** 只要收款还停在 PENDING_REFUND，就查一下挂在它身上的 WorkflowInstance，按其终态推进状态。 */
  private async reconcileStatus(payment: Payment): Promise<Payment> {
    if (payment.status !== 'PENDING_REFUND') return payment;
    const instance = await this.prisma.workflowInstance.findFirst({
      where: { businessType: BUSINESS_TYPE, businessId: payment.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!instance) return payment;

    let nextStatus: 'REFUNDED' | 'RECORDED' | null = null;
    if (instance.status === 'APPROVED' || instance.status === 'ARCHIVED') nextStatus = 'REFUNDED';
    else if (instance.status === 'REJECTED' || instance.status === 'WITHDRAWN') nextStatus = 'RECORDED';
    if (!nextStatus) return payment;

    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: nextStatus, version: { increment: 1 } },
    });
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'Payment',
      entityId: payment.id,
      beforeData: payment,
      afterData: updated,
      remark: `PENDING_REFUND -> ${nextStatus}（同步自 WorkflowInstance ${instance.id}）`,
      ...this.auditCtx(),
    });
    return updated;
  }

  private assertVersion(before: Payment, expectedVersion: number): void {
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
