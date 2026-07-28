import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { DietaryRestrictionService } from './dietary-restriction.service';
import { CreateDietaryRestrictionDto } from './dto/create-dietary-restriction.dto';
import { UpdateDietaryRestrictionDto } from './dto/update-dietary-restriction.dto';

@ApiTags('meal/dietary-restriction')
@Controller('meal/dietary-restrictions')
export class DietaryRestrictionController {
  constructor(private readonly dietaryRestrictionService: DietaryRestrictionService) {}

  @Get()
  @RequirePermission('meal.dietary-restriction.view')
  findAll() {
    return this.dietaryRestrictionService.findMany();
  }

  @Get(':id')
  @RequirePermission('meal.dietary-restriction.view')
  findOne(@Param('id') id: string) {
    return this.dietaryRestrictionService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('meal.dietary-restriction.create')
  create(@Body() dto: CreateDietaryRestrictionDto) {
    return this.dietaryRestrictionService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('meal.dietary-restriction.update')
  update(@Param('id') id: string, @Body() dto: UpdateDietaryRestrictionDto) {
    const { version, ...data } = dto;
    return this.dietaryRestrictionService.update(id, data, version);
  }
}
