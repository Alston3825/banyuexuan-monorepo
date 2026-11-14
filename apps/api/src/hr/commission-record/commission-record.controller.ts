import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CommissionRecordService } from './commission-record.service';
import { CreateCommissionRecordDto } from './dto/create-commission-record.dto';
import { QueryCommissionRecordDto } from './dto/query-commission-record.dto';
import { CancelCommissionRecordDto } from './dto/cancel-commission-record.dto';
import { VersionDto } from './dto/version.dto';

@ApiTags('hr/commission-record')
@Controller('hr/commission-records')
export class CommissionRecordController {
  constructor(private readonly commissionRecordService: CommissionRecordService) {}

  @Get()
  @RequirePermission('hr.commission-record.view')
  findAll(@Query() query: QueryCommissionRecordDto) {
    return this.commissionRecordService.findMany(query);
  }

  @Get(':id')
  @RequirePermission('hr.commission-record.view')
  findOne(@Param('id') id: string) {
    return this.commissionRecordService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('hr.commission-record.create')
  create(@Body() dto: CreateCommissionRecordDto) {
    return this.commissionRecordService.create(dto);
  }

  @Post(':id/submit')
  @RequirePermission('hr.commission-record.submit')
  submit(@Param('id') id: string, @Body() dto: VersionDto) {
    return this.commissionRecordService.submit(id, dto.version);
  }

  @Post(':id/cancel')
  @RequirePermission('hr.commission-record.cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelCommissionRecordDto) {
    return this.commissionRecordService.cancel(id, dto.cancelReason, dto.version);
  }
}
