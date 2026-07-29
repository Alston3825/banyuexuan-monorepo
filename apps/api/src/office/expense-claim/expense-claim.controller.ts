import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ExpenseClaimService } from './expense-claim.service';
import { CreateExpenseClaimDto } from './dto/create-expense-claim.dto';
import { QueryExpenseClaimDto } from './dto/query-expense-claim.dto';
import { CancelExpenseClaimDto } from './dto/cancel-expense-claim.dto';
import { VersionDto } from './dto/version.dto';

@ApiTags('office/expense-claim')
@Controller('office/expense-claims')
export class ExpenseClaimController {
  constructor(private readonly expenseClaimService: ExpenseClaimService) {}

  @Get()
  @RequirePermission('office.expense-claim.view')
  findAll(@Query() query: QueryExpenseClaimDto) {
    return this.expenseClaimService.findMany(query);
  }

  @Get(':id')
  @RequirePermission('office.expense-claim.view')
  findOne(@Param('id') id: string) {
    return this.expenseClaimService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('office.expense-claim.create')
  create(@Body() dto: CreateExpenseClaimDto) {
    return this.expenseClaimService.create(dto);
  }

  @Post(':id/submit')
  @RequirePermission('office.expense-claim.submit')
  submit(@Param('id') id: string, @Body() dto: VersionDto) {
    return this.expenseClaimService.submit(id, dto.version);
  }

  @Post(':id/cancel')
  @RequirePermission('office.expense-claim.cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelExpenseClaimDto) {
    return this.expenseClaimService.cancel(id, dto.cancelReason, dto.version);
  }
}
