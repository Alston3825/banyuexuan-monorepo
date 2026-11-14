import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CarePlanTemplateService } from './care-plan-template.service';
import { CreateCarePlanTemplateDto } from './dto/create-care-plan-template.dto';
import { UpdateCarePlanTemplateDto } from './dto/update-care-plan-template.dto';
import { QueryCarePlanTemplateDto } from './dto/query-care-plan-template.dto';

@ApiTags('care/plan-template')
@Controller('care/plan-templates')
export class CarePlanTemplateController {
  constructor(private readonly carePlanTemplateService: CarePlanTemplateService) {}

  @Get()
  @RequirePermission('care.plan-template.view')
  findAll(@Query() query: QueryCarePlanTemplateDto) {
    return this.carePlanTemplateService.findMany(query);
  }

  @Get(':id')
  @RequirePermission('care.plan-template.view')
  findOne(@Param('id') id: string) {
    return this.carePlanTemplateService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('care.plan-template.create')
  create(@Body() dto: CreateCarePlanTemplateDto) {
    return this.carePlanTemplateService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('care.plan-template.update')
  update(@Param('id') id: string, @Body() dto: UpdateCarePlanTemplateDto) {
    return this.carePlanTemplateService.update(id, dto);
  }
}
