import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CareRecordService } from './care-record.service';
import { CreateCareRecordDto } from './dto/create-care-record.dto';
import { QueryCareRecordDto } from './dto/query-care-record.dto';

@ApiTags('care/record')
@Controller('care/records')
export class CareRecordController {
  constructor(private readonly careRecordService: CareRecordService) {}

  @Get()
  @RequirePermission('care.record.view')
  findAll(@Query() query: QueryCareRecordDto) {
    return this.careRecordService.findMany(query);
  }

  @Get(':id')
  @RequirePermission('care.record.view')
  findOne(@Param('id') id: string) {
    return this.careRecordService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('care.record.create')
  create(@Body() dto: CreateCareRecordDto) {
    return this.careRecordService.create(dto);
  }
}
