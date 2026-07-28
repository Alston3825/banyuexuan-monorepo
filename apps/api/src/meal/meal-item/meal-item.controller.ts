import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { MealItemService } from './meal-item.service';
import { CreateMealItemDto } from './dto/create-meal-item.dto';
import { UpdateMealItemDto } from './dto/update-meal-item.dto';

@ApiTags('meal/item')
@Controller('meal/items')
export class MealItemController {
  constructor(private readonly mealItemService: MealItemService) {}

  @Get()
  @RequirePermission('meal.item.view')
  findAll() {
    return this.mealItemService.findMany();
  }

  @Get(':id')
  @RequirePermission('meal.item.view')
  findOne(@Param('id') id: string) {
    return this.mealItemService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('meal.item.create')
  create(@Body() dto: CreateMealItemDto) {
    return this.mealItemService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('meal.item.update')
  update(@Param('id') id: string, @Body() dto: UpdateMealItemDto) {
    const { version, ...data } = dto;
    return this.mealItemService.update(id, data, version);
  }
}
