import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CareAbnormalityService } from './care-abnormality.service';
import { QueryCareAbnormalityDto } from './dto/query-care-abnormality.dto';
import { FollowUpCareAbnormalityDto } from './dto/follow-up-care-abnormality.dto';
import { ResolveCareAbnormalityDto } from './dto/resolve-care-abnormality.dto';

@ApiTags('care/abnormality')
@Controller('care/abnormalities')
export class CareAbnormalityController {
  constructor(private readonly careAbnormalityService: CareAbnormalityService) {}

  @Get()
  @RequirePermission('care.abnormality.view')
  findAll(@Query() query: QueryCareAbnormalityDto) {
    return this.careAbnormalityService.findMany(query);
  }

  @Get(':id')
  @RequirePermission('care.abnormality.view')
  findOne(@Param('id') id: string) {
    return this.careAbnormalityService.findOneOrThrow(id);
  }

  @Get(':id/follow-ups')
  @RequirePermission('care.abnormality.view')
  followUps(@Param('id') id: string) {
    return this.careAbnormalityService.getFollowUps(id);
  }

  @Post(':id/follow-ups')
  @RequirePermission('care.abnormality.follow-up')
  follow(@Param('id') id: string, @Body() dto: FollowUpCareAbnormalityDto) {
    return this.careAbnormalityService.follow(id, dto);
  }

  @Post(':id/resolve')
  @RequirePermission('care.abnormality.resolve')
  resolve(@Param('id') id: string, @Body() dto: ResolveCareAbnormalityDto) {
    return this.careAbnormalityService.resolve(id, dto);
  }

  @Post(':id/ignore')
  @RequirePermission('care.abnormality.ignore')
  ignore(@Param('id') id: string, @Body() dto: ResolveCareAbnormalityDto) {
    return this.careAbnormalityService.ignore(id, dto);
  }
}
