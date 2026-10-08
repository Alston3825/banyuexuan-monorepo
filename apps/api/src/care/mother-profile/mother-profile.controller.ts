import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { IsArray, IsString } from 'class-validator';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { MotherProfileService } from './mother-profile.service';
import { CreateMotherProfileDto } from './dto/create-mother-profile.dto';
import { UpdateMotherProfileDto } from './dto/update-mother-profile.dto';
import { QueryMotherProfileDto } from './dto/query-mother-profile.dto';

class SetRiskTagsDto {
  @IsArray() @IsString({ each: true }) tagIds: string[];
}

@ApiTags('care/mother-profile')
@Controller('care/mother-profiles')
export class MotherProfileController {
  constructor(private readonly motherProfileService: MotherProfileService) {}

  @Get()
  @RequirePermission('care.profile.view')
  findAll(@Query() query: QueryMotherProfileDto) {
    return this.motherProfileService.findMany(query);
  }

  @Get('nurse-options')
  @RequirePermission('care.profile.view')
  nurseOptions(@Query('storeId') storeId?: string) {
    return this.motherProfileService.nurseOptions(storeId);
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

  /** 编辑风险标签：整体改成 tagIds（只能是母婴风险分类的标签） */
  @Put(':id/risk-tags')
  @RequirePermission('care.profile.update')
  setRiskTags(@Param('id') id: string, @Body() dto: SetRiskTagsDto) {
    return this.motherProfileService.setRiskTags(id, dto.tagIds);
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

  @Get(':id/delete-check')
  @RequirePermission('care.profile.update')
  deleteCheck(@Param('id') id: string) {
    return this.motherProfileService.getDeleteCheck(id);
  }

  /** 删除建错的母婴档案：有护理痕迹的拒绝（只能归档）；只有宝宝/评估表/资料的需要管理员权限 + 输入客户姓名确认。 */
  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('care.profile.update')
  remove(@Param('id') id: string, @Query('force') force?: string, @Query('confirmName') confirmName?: string) {
    return this.motherProfileService.remove(id, force === 'true', confirmName);
  }

  @Post(':id/archive')
  @HttpCode(204)
  @RequirePermission('care.profile.update')
  archive(@Param('id') id: string) {
    return this.motherProfileService.archive(id);
  }

  @Post(':id/restore')
  @HttpCode(204)
  @RequirePermission('care.profile.update')
  restore(@Param('id') id: string) {
    return this.motherProfileService.restore(id);
  }
}
