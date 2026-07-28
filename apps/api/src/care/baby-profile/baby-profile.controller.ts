import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { BabyProfileService } from './baby-profile.service';
import { CreateBabyProfileDto } from './dto/create-baby-profile.dto';
import { UpdateBabyProfileDto } from './dto/update-baby-profile.dto';
import { QueryBabyProfileDto } from './dto/query-baby-profile.dto';

@ApiTags('care/baby-profile')
@Controller('care/baby-profiles')
export class BabyProfileController {
  constructor(private readonly babyProfileService: BabyProfileService) {}

  @Get()
  @RequirePermission('care.profile.view')
  findAll(@Query() query: QueryBabyProfileDto) {
    return this.babyProfileService.findMany(query);
  }

  @Get(':id')
  @RequirePermission('care.profile.view')
  findOne(@Param('id') id: string) {
    return this.babyProfileService.findOneOrThrow(id);
  }

  @Get(':id/risk-tags')
  @RequirePermission('care.profile.view')
  riskTags(@Param('id') id: string) {
    return this.babyProfileService.getRiskTags(id);
  }

  @Post()
  @RequirePermission('care.profile.create')
  create(@Body() dto: CreateBabyProfileDto) {
    return this.babyProfileService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('care.profile.update')
  update(@Param('id') id: string, @Body() dto: UpdateBabyProfileDto) {
    return this.babyProfileService.update(id, dto);
  }
}
