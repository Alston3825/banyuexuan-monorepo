import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CarePlanService } from './care-plan.service';
import { CreateCarePlanDto } from './dto/create-care-plan.dto';
import { QueryCarePlanDto } from './dto/query-care-plan.dto';
import { TerminateCarePlanDto } from './dto/terminate-care-plan.dto';

@ApiTags('care/plan')
@Controller('care/plans')
export class CarePlanController {
  constructor(private readonly carePlanService: CarePlanService) {}

  @Get()
  @RequirePermission('care.plan.view')
  findAll(@Query() query: QueryCarePlanDto) {
    return this.carePlanService.findMany(query);
  }

  @Get(':id')
  @RequirePermission('care.plan.view')
  findOne(@Param('id') id: string) {
    return this.carePlanService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('care.plan.create')
  create(@Body() dto: CreateCarePlanDto) {
    return this.carePlanService.create(dto);
  }

  @Post(':id/terminate')
  @RequirePermission('care.plan.terminate')
  terminate(@Param('id') id: string, @Body() dto: TerminateCarePlanDto) {
    return this.carePlanService.terminate(id, dto.reason, dto.version);
  }
}
