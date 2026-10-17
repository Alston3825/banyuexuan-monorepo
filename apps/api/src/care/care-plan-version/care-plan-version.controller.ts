import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsArray, IsInt, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CarePlanVersionService, CareServiceLogService, PlanBody, ServiceLogBody } from './care-plan-version.service';

class PlanDto implements PlanBody {
  @ApiProperty({ required: false }) @IsOptional() @IsString() motherProfileId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() babyProfileId?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsString() level?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() source?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() assessmentSummary?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsString() focusPoints?: string | null;
  @ApiProperty({ required: false }) @IsOptional() measures?: { title?: string; content?: string; frequency?: string }[];
  @ApiProperty({ required: false }) @IsOptional() @IsString() progressNote?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsString() adjustReason?: string | null;
  @ApiProperty({ required: false }) @IsOptional() directActivate?: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() version?: number;
}

class VersionDto {
  @ApiProperty() @IsInt() version: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() comment?: string;
}

class RejectDto {
  @ApiProperty() @IsInt() version: number;
  @ApiProperty() @IsString() @IsNotEmpty() comment: string;
}

class ServiceLogDto implements ServiceLogBody {
  @ApiProperty() @IsString() @IsNotEmpty() motherProfileId: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() babyProfileId?: string | null;
  @ApiProperty() @IsString() @IsNotEmpty() serviceCode: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() doneDate?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() doneTime?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() systolic?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() diastolic?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() weightKg?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() doneByName?: string;
  @ApiProperty({ required: false }) @IsOptional() clientSigned?: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsString() note?: string;
}
class ImportPreviewDto {
  @ApiProperty() @IsString() @IsNotEmpty() documentId: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() babyProfileId?: string | null;
}
class ImportCommitDto extends ImportPreviewDto {
  @ApiProperty() @IsArray() items: { serviceCode: string; date: string; time?: string | null; systolic?: number | null; diastolic?: number | null; weightKg?: number | null; doneByName?: string | null; clientSigned?: boolean }[];
}
void IsObject;

@ApiTags('care/plan-version')
@Controller('care')
export class CarePlanVersionController {
  constructor(
    private readonly service: CarePlanVersionService,
    private readonly logs: CareServiceLogService,
  ) {}

  // ---------- 个人化护理计划（版本制） ----------
  @Get('plan-versions/standards')
  @RequirePermission('care.profile.view')
  standards() {
    return this.service.standards();
  }

  @Get('plan-versions/due')
  @RequirePermission('care.profile.view')
  due(@Query('storeId') storeId?: string) {
    return this.service.due(storeId);
  }

  @Get('plan-versions')
  @RequirePermission('care.profile.view')
  list(@Query('motherProfileId') motherProfileId: string) {
    return this.service.list(motherProfileId);
  }

  @Post('plan-versions')
  @RequirePermission('care.profile.update')
  create(@Body() dto: PlanDto) {
    return this.service.create(dto);
  }

  @Patch('plan-versions/:id')
  @RequirePermission('care.profile.update')
  update(@Param('id') id: string, @Body() dto: PlanDto) {
    return this.service.update(id, dto);
  }

  @Post('plan-versions/:id/submit')
  @RequirePermission('care.profile.update')
  submit(@Param('id') id: string, @Body() dto: VersionDto) {
    return this.service.submit(id, dto.version);
  }

  @Post('plan-versions/:id/approve')
  @RequirePermission('care.profile.view')
  approve(@Param('id') id: string, @Body() dto: VersionDto) {
    return this.service.approve(id, dto.version, dto.comment);
  }

  @Post('plan-versions/:id/reject')
  @RequirePermission('care.profile.view')
  reject(@Param('id') id: string, @Body() dto: RejectDto) {
    return this.service.reject(id, dto.version, dto.comment);
  }

  // ---------- 服务执行记录 ----------
  @Get('service-logs/summary')
  @RequirePermission('care.profile.view')
  summary(@Query('motherProfileId') motherProfileId: string) {
    return this.logs.summary(motherProfileId);
  }

  @Post('service-logs')
  @RequirePermission('care.profile.update')
  createLog(@Body() dto: ServiceLogDto) {
    return this.logs.create(dto);
  }

  /** 拍照识别的纸质护理计划表 → 比对已登记记录，只列出新写的（预览，不入库） */
  @Post('service-logs/import-preview')
  @RequirePermission('care.profile.update')
  importPreview(@Body() dto: ImportPreviewDto) {
    return this.logs.importPreview(dto.documentId, dto.babyProfileId);
  }

  /** 确认登记勾选的记录（已有的自动跳过） */
  @Post('service-logs/import-commit')
  @RequirePermission('care.profile.update')
  importCommit(@Body() dto: ImportCommitDto) {
    return this.logs.importCommit(dto);
  }

  @Delete('service-logs/:id')
  @HttpCode(204)
  @RequirePermission('care.profile.update')
  removeLog(@Param('id') id: string) {
    return this.logs.remove(id);
  }
}
