import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CareAssessmentService } from './care-assessment.service';

class CreateAssessmentDto {
  @ApiProperty({ description: '妈妈档案 id（产妇表）或宝宝档案 id（宝宝表）' }) @IsString() @IsNotEmpty() profileId: string;
  @ApiProperty({ required: false, description: '对应的纸质原件资料 id' }) @IsOptional() @IsString() documentId?: string;
  @ApiProperty({ description: '表单字段值，key 见 GET specs' }) @IsObject() values: Record<string, unknown>;
}

class UpdateAssessmentDto {
  @ApiProperty() @IsInt() version: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() documentId?: string | null;
  @ApiProperty() @IsObject() values: Record<string, unknown>;
}

@ApiTags('care/assessment')
@Controller('care/assessments')
export class CareAssessmentController {
  constructor(private readonly service: CareAssessmentService) {}

  /** 四张评估表的字段说明书，前端按它自动生成录入/复核表单。 */
  @Get('specs')
  @RequirePermission('care.profile.view')
  specs() {
    return this.service.specs();
  }

  @Get('overview')
  @RequirePermission('care.profile.view')
  overview(@Query('motherProfileId') motherProfileId: string) {
    return this.service.overview(motherProfileId);
  }

  @Post(':type')
  @RequirePermission('care.profile.create')
  create(@Param('type') type: string, @Body() dto: CreateAssessmentDto) {
    return this.service.create(type, dto);
  }

  @Patch(':type/:id')
  @RequirePermission('care.profile.update')
  update(@Param('type') type: string, @Param('id') id: string, @Body() dto: UpdateAssessmentDto) {
    return this.service.update(type, id, dto);
  }
}
