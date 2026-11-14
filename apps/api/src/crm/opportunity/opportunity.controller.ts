import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { OpportunityService } from './opportunity.service';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { AdvanceStageDto } from './dto/advance-stage.dto';
import { LoseOpportunityDto } from './dto/lose-opportunity.dto';
import { QueryOpportunityDto } from './dto/query-opportunity.dto';

@ApiTags('crm/opportunity')
@Controller('crm/opportunities')
export class OpportunityController {
  constructor(private readonly opportunityService: OpportunityService) {}

  @Get()
  @RequirePermission('crm.opportunity.view')
  findAll(@Query() query: QueryOpportunityDto) {
    return this.opportunityService.findMany(query);
  }

  @Get(':id')
  @RequirePermission('crm.opportunity.view')
  findOne(@Param('id') id: string) {
    return this.opportunityService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('crm.opportunity.create')
  create(@Body() dto: CreateOpportunityDto) {
    return this.opportunityService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('crm.opportunity.update')
  update(@Param('id') id: string, @Body() dto: UpdateOpportunityDto) {
    const { version, ...data } = dto;
    return this.opportunityService.update(id, data, version);
  }

  @Post(':id/advance-stage')
  @RequirePermission('crm.opportunity.advance-stage')
  advanceStage(@Param('id') id: string, @Body() dto: AdvanceStageDto) {
    return this.opportunityService.advanceStage(id, dto.targetStage, dto.version);
  }

  @Post(':id/lose')
  @RequirePermission('crm.opportunity.lose')
  lose(@Param('id') id: string, @Body() dto: LoseOpportunityDto) {
    return this.opportunityService.lose(id, dto.lostReason, dto.version);
  }
}
