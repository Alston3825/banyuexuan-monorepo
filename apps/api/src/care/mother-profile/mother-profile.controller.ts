import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { MotherProfileService } from './mother-profile.service';
import { CreateMotherProfileDto } from './dto/create-mother-profile.dto';
import { UpdateMotherProfileDto } from './dto/update-mother-profile.dto';
import { QueryMotherProfileDto } from './dto/query-mother-profile.dto';

@ApiTags('care/mother-profile')
@Controller('care/mother-profiles')
export class MotherProfileController {
  constructor(private readonly motherProfileService: MotherProfileService) {}

  @Get()
  @RequirePermission('care.profile.view')
  findAll(@Query() query: QueryMotherProfileDto) {
    return this.motherProfileService.findMany(query);
  }

  @Get(':id')
  @RequirePermission('care.profile.view')
  findOne(@Param('id') id: string) {
    return this.motherProfileService.findOneOrThrow(id);
  }

  @Get(':id/risk-tags')
  @RequirePermission('care.profile.view')
  riskTags(@Param('id') id: string) {
    return this.motherProfileService.getRiskTags('MOTHER_PROFILE', id);
  }

  @Post()
  @RequirePermission('care.profile.create')
  create(@Body() dto: CreateMotherProfileDto) {
    return this.motherProfileService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('care.profile.update')
  update(@Param('id') id: string, @Body() dto: UpdateMotherProfileDto) {
    return this.motherProfileService.update(id, dto);
  }
}
