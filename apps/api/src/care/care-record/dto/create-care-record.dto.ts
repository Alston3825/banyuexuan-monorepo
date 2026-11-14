import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateCareRecordDto {
  @ApiProperty() @IsString() formTemplateId: string;

  @ApiProperty({ required: false, description: 'motherProfileId/babyProfileId 二选一' })
  @IsOptional()
  @IsString()
  motherProfileId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  babyProfileId?: string;

  @ApiProperty({ description: '护理行为实际发生时间' }) @IsDateString() occurredAt: string;

  @ApiProperty({ description: '{fieldCode: value}' }) @IsObject() values: Record<string, unknown>;

  @ApiProperty({ required: false, description: '关联的每日任务卡片（提交后自动置为已完成）' })
  @IsOptional()
  @IsString()
  carePlanTaskId?: string;

  @ApiProperty({ required: false, default: false, description: '是否为补录（当天遗漏事后补记）' })
  @IsOptional()
  @IsBoolean()
  isBackfilled?: boolean;

  @ApiProperty({ required: false, description: 'isBackfilled=true 时必填' })
  @IsOptional()
  @IsString()
  backfillReason?: string;

  @ApiProperty({ required: false, description: '若为对某条已提交记录的更正，填被更正记录的 ID' })
  @IsOptional()
  @IsString()
  correctionOfId?: string;
}
