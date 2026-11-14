import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { DinerProfileService } from './diner-profile.service';
import { CreateDinerProfileDto } from './dto/create-diner-profile.dto';
import { QueryDinerProfileDto } from './dto/query-diner-profile.dto';

@ApiTags('meal/diner-profile')
@Controller('meal/diner-profiles')
export class DinerProfileController {
  constructor(private readonly dinerProfileService: DinerProfileService) {}

  @Get()
  @RequirePermission('meal.diner-profile.view')
  findAll(@Query() query: QueryDinerProfileDto) {
    return this.dinerProfileService.findMany(query);
  }

  @Get(':id')
  @RequirePermission('meal.diner-profile.view')
  findOne(@Param('id') id: string) {
    return this.dinerProfileService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('meal.diner-profile.create')
  create(@Body() dto: CreateDinerProfileDto) {
    return this.dinerProfileService.create(dto);
  }

  @Post(':id/end')
  @RequirePermission('meal.diner-profile.end')
  end(@Param('id') id: string) {
    return this.dinerProfileService.end(id);
  }
}
