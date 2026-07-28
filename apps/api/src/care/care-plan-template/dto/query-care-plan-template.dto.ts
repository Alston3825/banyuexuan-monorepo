import { ApiProperty } from '@nestjs/swagger';
import { CareTargetType } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class QueryCarePlanTemplateDto {
  @ApiProperty({ required: false, enum: CareTargetType })
  @IsOptional()
  @IsEnum(CareTargetType)
  targetType?: CareTargetType;
}
