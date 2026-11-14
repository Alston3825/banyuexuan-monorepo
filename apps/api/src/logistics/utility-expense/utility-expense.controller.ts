import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { UtilityExpenseService } from './utility-expense.service';
import { CreateUtilityExpenseDto } from './dto/create-utility-expense.dto';
import { UpdateUtilityExpenseDto } from './dto/update-utility-expense.dto';
import { QueryUtilityExpenseDto } from './dto/query-utility-expense.dto';

@ApiTags('logistics/utility-expense')
@Controller('logistics/utility-expenses')
export class UtilityExpenseController {
  constructor(private readonly utilityExpenseService: UtilityExpenseService) {}

  @Get()
  @RequirePermission('logistics.utility-expense.view')
  findAll(@Query() query: QueryUtilityExpenseDto) {
    return this.utilityExpenseService.findMany(query);
  }

  @Get(':id')
  @RequirePermission('logistics.utility-expense.view')
  findOne(@Param('id') id: string) {
    return this.utilityExpenseService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('logistics.utility-expense.create')
  create(@Body() dto: CreateUtilityExpenseDto) {
    return this.utilityExpenseService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('logistics.utility-expense.update')
  update(@Param('id') id: string, @Body() dto: UpdateUtilityExpenseDto) {
    const { version, ...data } = dto;
    return this.utilityExpenseService.update(id, data, version);
  }
}
