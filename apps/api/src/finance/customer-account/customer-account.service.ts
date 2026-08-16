import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { CustomerAccount, CustomerAccountTransaction, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { CustomerService } from '../../crm/customer/customer.service';
import { RechargeCustomerAccountDto } from './dto/recharge-customer-account.dto';
import { ConsumeCustomerAccountDto } from './dto/consume-customer-account.dto';
import { RefundCustomerAccountDto } from './dto/refund-customer-account.dto';
import { AdjustCustomerAccountDto } from './dto/adjust-customer-account.dto';

/**
 * 会员账户（财务结算深化，落地业务规则确认记录#5）：本金/赠送两个子池，消费按
 * "赠送优先，再扣本金"顺序自动拆分。与 Payment（强绑定 Contract 的合同收款）是两类
 * 不同性质的资金记录，不合并、不互相依赖。余额变更用数据库原子 increment/decrement
 * 保证并发安全，不要求前端传 expectedVersion——高频小额记账场景，不同于"整单编辑"的
 * 乐观锁语义。但纯 increment/decrement 不足以保护 consume()/adjust() 里"先读余额判断
 * 够不够扣、再写回"这一步：两个并发请求可能都基于同一份旧余额通过校验，都执行扣减，
 * 导致余额被扣成负数。这两个方法内部用 version 字段做乐观重试（读→算→用 version 做
 * 条件更新→若被并发改过就重读重算再试），version 只在方法内部当并发控制用，不是对外
 * API 契约的一部分，调用方感知不到。
 */
@Injectable()
export class CustomerAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerService: CustomerService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  /** 查询余额，账户不存在时视为余额为0（不预先为每个客户建档，首次充值/消费时才创建）。 */
  async findByCustomer(customerId: string): Promise<CustomerAccount> {
    await this.customerService.findOneOrThrow(customerId);
    const existing = await this.prisma.customerAccount.findUnique({ where: { customerId } });
    if (existing) return existing;
    return {
      id: '',
      tenantId: this.ctx.tenantId!,
      customerId,
      principalBalance: 0,
      giftBalance: 0,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      version: 0,
    };
  }

  async listTransactions(customerId: string): Promise<CustomerAccountTransaction[]> {
    const account = await this.prisma.customerAccount.findUnique({ where: { customerId } });
    if (!account) return [];
    return this.prisma.customerAccountTransaction.findMany({
      where: { tenantId: this.ctx.tenantId, accountId: account.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async recharge(dto: RechargeCustomerAccountDto): Promise<CustomerAccount> {
    const principalAmount = dto.principalAmount ?? 0;
    const giftAmount = dto.giftAmount ?? 0;
    if (principalAmount <= 0 && giftAmount <= 0) {
      throw new BadRequestException('充值本金与赠送额度至少填写一项');
    }
    await this.customerService.findOneOrThrow(dto.customerId);

    const { account, transaction } = await this.prisma.$transaction(async (tx) => {
      const account = await tx.customerAccount.upsert({
        where: { customerId: dto.customerId },
        update: {
          principalBalance: { increment: principalAmount },
          giftBalance: { increment: giftAmount },
          version: { increment: 1 },
        },
        create: {
          tenantId: this.ctx.tenantId!,
          customerId: dto.customerId,
          principalBalance: principalAmount,
          giftBalance: giftAmount,
        },
      });
      const transaction = await tx.customerAccountTransaction.create({
        data: {
          tenantId: this.ctx.tenantId!,
          accountId: account.id,
          type: 'RECHARGE',
          principalDelta: principalAmount,
          giftDelta: giftAmount,
          principalAfter: account.principalBalance,
          giftAfter: account.giftBalance,
          sourceType: 'MANUAL',
          remark: dto.remark,
          createdBy: this.ctx.accountId!,
        },
      });
      return { account, transaction };
    });

    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'CustomerAccountTransaction',
      entityId: transaction.id,
      afterData: transaction,
      remark: `充值：本金+${principalAmount}，赠送+${giftAmount}`,
      ...this.auditCtx(),
    });
    return account;
  }

  /** 消费：赠送余额优先扣减，不足部分扣本金；两者合计仍不足则拒绝。 */
  async consume(dto: ConsumeCustomerAccountDto): Promise<CustomerAccount> {
    await this.customerService.findOneOrThrow(dto.customerId);

    const MAX_RETRIES = 5;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const existing = await this.prisma.customerAccount.findUnique({ where: { customerId: dto.customerId } });
      const currentGift = existing?.giftBalance ?? 0;
      const currentPrincipal = existing?.principalBalance ?? 0;
      if (currentGift + currentPrincipal < dto.amount) {
        throw new BadRequestException(`账户余额不足，当前可用余额 ${currentGift + currentPrincipal} 分，需要消费 ${dto.amount} 分`);
      }
      const giftDeduct = Math.min(currentGift, dto.amount);
      const principalDeduct = dto.amount - giftDeduct;
      const currentVersion = existing?.version ?? 0;

      try {
        const { account, transaction } = await this.prisma.$transaction(async (tx) => {
          // where 带上 version：如果这行余额在"读取判断够不够"和这里落库之间被别的并发
          // 消费请求改过，匹配不到行会抛 P2025，外层 catch 住重新读最新余额再算一次，
          // 不会出现两个请求都基于同一份旧余额通过校验、都扣成功导致余额倒扣成负数。
          const account = await tx.customerAccount.update({
            where: { customerId: dto.customerId, version: currentVersion },
            data: {
              giftBalance: { decrement: giftDeduct },
              principalBalance: { decrement: principalDeduct },
              version: { increment: 1 },
            },
          });
          const transaction = await tx.customerAccountTransaction.create({
            data: {
              tenantId: this.ctx.tenantId!,
              accountId: account.id,
              type: 'CONSUME',
              principalDelta: -principalDeduct,
              giftDelta: -giftDeduct,
              principalAfter: account.principalBalance,
              giftAfter: account.giftBalance,
              sourceType: dto.sourceType ?? 'MANUAL',
              sourceId: dto.sourceId,
              remark: dto.remark,
              createdBy: this.ctx.accountId!,
            },
          });
          return { account, transaction };
        });

        await this.auditLogService.record({
          action: 'CREATE',
          entityType: 'CustomerAccountTransaction',
          entityId: transaction.id,
          afterData: transaction,
          remark: `消费 ${dto.amount} 分：赠送优先扣${giftDeduct}，本金扣${principalDeduct}`,
          ...this.auditCtx(),
        });
        return account;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') continue;
        throw err;
      }
    }
    throw new ConflictException('账户余额并发修改过于频繁，请重试');
  }

  /** 退款：退回本金/赠送各多少由操作员显式指定，不做反查原消费记录的自动比例拆分。 */
  async refund(dto: RefundCustomerAccountDto): Promise<CustomerAccount> {
    const principalAmount = dto.principalAmount ?? 0;
    const giftAmount = dto.giftAmount ?? 0;
    if (principalAmount <= 0 && giftAmount <= 0) {
      throw new BadRequestException('退回本金与赠送额度至少填写一项');
    }
    await this.customerService.findOneOrThrow(dto.customerId);

    const { account, transaction } = await this.prisma.$transaction(async (tx) => {
      const account = await tx.customerAccount.upsert({
        where: { customerId: dto.customerId },
        update: {
          principalBalance: { increment: principalAmount },
          giftBalance: { increment: giftAmount },
          version: { increment: 1 },
        },
        create: {
          tenantId: this.ctx.tenantId!,
          customerId: dto.customerId,
          principalBalance: principalAmount,
          giftBalance: giftAmount,
        },
      });
      const transaction = await tx.customerAccountTransaction.create({
        data: {
          tenantId: this.ctx.tenantId!,
          accountId: account.id,
          type: 'REFUND',
          principalDelta: principalAmount,
          giftDelta: giftAmount,
          principalAfter: account.principalBalance,
          giftAfter: account.giftBalance,
          sourceType: dto.sourceType ?? 'MANUAL',
          sourceId: dto.sourceId,
          remark: dto.remark,
          createdBy: this.ctx.accountId!,
        },
      });
      return { account, transaction };
    });

    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'CustomerAccountTransaction',
      entityId: transaction.id,
      afterData: transaction,
      remark: `退款：本金+${principalAmount}，赠送+${giftAmount}`,
      ...this.auditCtx(),
    });
    return account;
  }

  /** 人工调整（纠错用）：不允许调整后任一子池余额为负。 */
  async adjust(dto: AdjustCustomerAccountDto): Promise<CustomerAccount> {
    await this.customerService.findOneOrThrow(dto.customerId);

    const MAX_RETRIES = 5;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const existing = await this.prisma.customerAccount.findUnique({ where: { customerId: dto.customerId } });
      const nextPrincipal = (existing?.principalBalance ?? 0) + dto.principalDelta;
      const nextGift = (existing?.giftBalance ?? 0) + dto.giftDelta;
      if (nextPrincipal < 0 || nextGift < 0) {
        throw new BadRequestException('调整后余额不能为负');
      }
      const currentVersion = existing?.version ?? 0;

      try {
        const { account, transaction } = await this.prisma.$transaction(async (tx) => {
          // 首次调整时账户可能还不存在（upsert 的 create 分支），这种情况天然不存在并发
          // 覆盖问题（没有旧数据可覆盖）；已存在时用同样的 version 条件重试模式兜底，
          // 理由同 consume()。
          const account = existing
            ? await tx.customerAccount.update({
                where: { customerId: dto.customerId, version: currentVersion },
                data: {
                  principalBalance: { increment: dto.principalDelta },
                  giftBalance: { increment: dto.giftDelta },
                  version: { increment: 1 },
                },
              })
            : await tx.customerAccount.create({
                data: {
                  tenantId: this.ctx.tenantId!,
                  customerId: dto.customerId,
                  principalBalance: dto.principalDelta,
                  giftBalance: dto.giftDelta,
                },
              });
          const transaction = await tx.customerAccountTransaction.create({
            data: {
              tenantId: this.ctx.tenantId!,
              accountId: account.id,
              type: 'ADJUST',
              principalDelta: dto.principalDelta,
              giftDelta: dto.giftDelta,
              principalAfter: account.principalBalance,
              giftAfter: account.giftBalance,
              sourceType: 'MANUAL',
              remark: dto.remark,
              createdBy: this.ctx.accountId!,
            },
          });
          return { account, transaction };
        });

        await this.auditLogService.record({
          action: 'CREATE',
          entityType: 'CustomerAccountTransaction',
          entityId: transaction.id,
          afterData: transaction,
          remark: `人工调整：本金${dto.principalDelta >= 0 ? '+' : ''}${dto.principalDelta}，赠送${dto.giftDelta >= 0 ? '+' : ''}${dto.giftDelta}：${dto.remark}`,
          ...this.auditCtx(),
        });
        return account;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') continue;
        throw err;
      }
    }
    throw new ConflictException('账户余额并发修改过于频繁，请重试');
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
