import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateCarePlanDto {
  @ApiProperty() @IsString() planTemplateId: string;
  @ApiProperty({ required: false, description: 'motherProfileId/babyProfileId 二选一' })
  @IsOptional()
  @IsString()
  motherProfileId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  babyProfileId?: string;

  @ApiProperty({ description: '方案第1天对应的日期，通常=入住日' })
  @IsDateString()
  startDate: string;
}
