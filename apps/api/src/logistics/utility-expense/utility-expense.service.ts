import { BadRequestException, Injectable } from '@nestjs/common';
import { UtilityExpense } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { BaseScopedCrudService } from '../../common/base/base-scoped-crud.service';
import { QueryUtilityExpenseDto } from './dto/query-utility-expense.dto';

/** 水电费等后勤运营成本：门店级登记，不做分摊到客户房费成本核算（见业务规则确认记录#16）。 */
@Injectable()
export class UtilityExpenseService extends BaseScopedCrudService<UtilityExpense> {
  protected readonly entityType = 'UtilityExpense';

  constructor(
    private readonly prisma: PrismaService,
    auditLogService: AuditLogService,
    ctx: RequestContextService,
  ) {
    super(auditLogService, ctx);
  }

  protected get delegate() {
    return this.prisma.utilityExpense;
  }

  findMany(query: QueryUtilityExpenseDto = {}): Promise<UtilityExpense[]> {
    return this.prisma.utilityExpense.findMany({
      where: { tenantId: this.ctx.tenantId, storeId: query.storeId, period: query.period },
      orderBy: { period: 'desc' },
    });
  }

  async create(dto: {
    storeId: string;
    period: string;
    expenseType: UtilityExpense['expenseType'];
    amount: number;
    remark?: string;
  }) {
    const existing = await this.prisma.utilityExpense.findFirst({
      where: { tenantId: this.ctx.tenantId, storeId: dto.storeId, period: dto.period, expenseType: dto.expenseType },
    });
    if (existing) {
      throw new BadRequestException(`该门店${dto.period}的该类费用已存在登记记录，请编辑原记录而非重复新建`);
    }
    return super.create({ ...dto, tenantId: this.ctx.tenantId });
  }
}
