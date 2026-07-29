import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PayrollRecordService } from './payroll-record.service';
import { CreatePayrollRecordDto } from './dto/create-payroll-record.dto';
import { QueryPayrollRecordDto } from './dto/query-payroll-record.dto';
import { CancelPayrollRecordDto } from './dto/cancel-payroll-record.dto';
import { VersionDto } from './dto/version.dto';

@ApiTags('hr/payroll-record')
@Controller('hr/payroll-records')
export class PayrollRecordController {
  constructor(private readonly payrollRecordService: PayrollRecordService) {}

  @Get()
  @RequirePermission('hr.payroll-record.view')
  findAll(@Query() query: QueryPayrollRecordDto) {
    return this.payrollRecordService.findMany(query);
  }

  @Get(':id')
  @RequirePermission('hr.payroll-record.view')
  findOne(@Param('id') id: string) {
    return this.payrollRecordService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('hr.payroll-record.create')
  create(@Body() dto: CreatePayrollRecordDto) {
    return this.payrollRecordService.create(dto);
  }

  @Post(':id/submit')
  @RequirePermission('hr.payroll-record.submit')
  submit(@Param('id') id: string, @Body() dto: VersionDto) {
    return this.payrollRecordService.submit(id, dto.version);
  }

  @Post(':id/mark-paid')
  @RequirePermission('hr.payroll-record.mark-paid')
  markPaid(@Param('id') id: string, @Body() dto: VersionDto) {
    return this.payrollRecordService.markPaid(id, dto.version);
  }

  @Post(':id/cancel')
  @RequirePermission('hr.payroll-record.cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelPayrollRecordDto) {
    return this.payrollRecordService.cancel(id, dto.cancelReason, dto.version);
  }
}
