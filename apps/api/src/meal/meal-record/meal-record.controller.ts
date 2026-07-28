import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { MealRecordService } from './meal-record.service';
import { QueryMealRecordDto } from './dto/query-meal-record.dto';
import { SelectMealRecordDto } from './dto/select-meal-record.dto';
import { FeedbackMealRecordDto } from './dto/feedback-meal-record.dto';

@ApiTags('meal/record')
@Controller('meal/records')
export class MealRecordController {
  constructor(private readonly mealRecordService: MealRecordService) {}

  @Get()
  @RequirePermission('meal.record.view')
  findAll(@Query() query: QueryMealRecordDto) {
    return this.mealRecordService.findMany(query);
  }

  @Get(':id')
  @RequirePermission('meal.record.view')
  findOne(@Param('id') id: string) {
    return this.mealRecordService.findOneOrThrow(id);
  }

  @Post(':id/select')
  @RequirePermission('meal.record.select')
  select(@Param('id') id: string, @Body() dto: SelectMealRecordDto) {
    return this.mealRecordService.select(id, dto);
  }

  @Post(':id/serve')
  @RequirePermission('meal.record.serve')
  serve(@Param('id') id: string) {
    return this.mealRecordService.serve(id);
  }

  @Post(':id/feedback')
  @RequirePermission('meal.record.feedback')
  feedback(@Param('id') id: string, @Body() dto: FeedbackMealRecordDto) {
    return this.mealRecordService.feedback(id, dto);
  }
}
