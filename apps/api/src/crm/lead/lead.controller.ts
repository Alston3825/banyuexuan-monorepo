import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { LeadService } from './lead.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { AssignLeadDto } from './dto/assign-lead.dto';
import { ConvertLeadDto } from './dto/convert-lead.dto';
import { LoseLeadDto } from './dto/lose-lead.dto';
import { QueryLeadDto } from './dto/query-lead.dto';

@ApiTags('crm/lead')
@Controller('crm/leads')
export class LeadController {
  constructor(private readonly leadService: LeadService) {}

  @Get()
  @RequirePermission('crm.lead.view')
  findAll(@Query() query: QueryLeadDto) {
    return this.leadService.findMany(query);
  }

  @Get(':id')
  @RequirePermission('crm.lead.view')
  findOne(@Param('id') id: string) {
    return this.leadService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('crm.lead.create')
  create(@Body() dto: CreateLeadDto) {
    return this.leadService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('crm.lead.update')
  update(@Param('id') id: string, @Body() dto: UpdateLeadDto) {
    const { version, ...data } = dto;
    return this.leadService.update(id, data, version);
  }

  @Post(':id/assign')
  @RequirePermission('crm.lead.assign')
  assign(@Param('id') id: string, @Body() dto: AssignLeadDto) {
    return this.leadService.assign(id, dto.assignedToId, dto.version);
  }

  @Post(':id/convert')
  @RequirePermission('crm.lead.convert')
  convert(@Param('id') id: string, @Body() dto: ConvertLeadDto) {
    return this.leadService.convert(id, dto.version);
  }

  @Post(':id/lose')
  @RequirePermission('crm.lead.lose')
  lose(@Param('id') id: string, @Body() dto: LoseLeadDto) {
    return this.leadService.lose(id, dto.lostReason, dto.version);
  }
}
