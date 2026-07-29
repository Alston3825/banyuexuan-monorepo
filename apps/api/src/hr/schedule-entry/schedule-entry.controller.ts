import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ScheduleEntryService } from './schedule-entry.service';
import { CreateScheduleEntryDto } from './dto/create-schedule-entry.dto';
import { UpdateScheduleEntryDto } from './dto/update-schedule-entry.dto';
import { QueryScheduleEntryDto } from './dto/query-schedule-entry.dto';

@ApiTags('hr/schedule-entry')
@Controller('hr/schedule-entries')
export class ScheduleEntryController {
  constructor(private readonly scheduleEntryService: ScheduleEntryService) {}

  @Get()
  @RequirePermission('hr.schedule-entry.view')
  findAll(@Query() query: QueryScheduleEntryDto) {
    return this.scheduleEntryService.findMany(query);
  }

  @Post()
  @RequirePermission('hr.schedule-entry.create')
  create(@Body() dto: CreateScheduleEntryDto) {
    return this.scheduleEntryService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('hr.schedule-entry.update')
  update(@Param('id') id: string, @Body() dto: UpdateScheduleEntryDto) {
    return this.scheduleEntryService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('hr.schedule-entry.delete')
  delete(@Param('id') id: string) {
    return this.scheduleEntryService.delete(id);
  }
}
