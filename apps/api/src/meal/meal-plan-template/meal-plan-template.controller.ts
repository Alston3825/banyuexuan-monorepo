import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { MealPlanTemplateService } from './meal-plan-template.service';
import { CreateMealPlanTemplateDto } from './dto/create-meal-plan-template.dto';
import { UpdateMealPlanTemplateDto } from './dto/update-meal-plan-template.dto';

@ApiTags('meal/plan-template')
@Controller('meal/plan-templates')
export class MealPlanTemplateController {
  constructor(private readonly mealPlanTemplateService: MealPlanTemplateService) {}

  @Get()
  @RequirePermission('meal.plan-template.view')
  findAll() {
    return this.mealPlanTemplateService.findMany();
  }

  @Get(':id')
  @RequirePermission('meal.plan-template.view')
  findOne(@Param('id') id: string) {
    return this.mealPlanTemplateService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('meal.plan-template.create')
  create(@Body() dto: CreateMealPlanTemplateDto) {
    return this.mealPlanTemplateService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('meal.plan-template.update')
  update(@Param('id') id: string, @Body() dto: UpdateMealPlanTemplateDto) {
    return this.mealPlanTemplateService.update(id, dto);
  }
}
