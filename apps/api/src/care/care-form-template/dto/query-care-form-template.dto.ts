import { ApiProperty } from '@nestjs/swagger';
import { CareFormDepartment, CareTargetType } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class QueryCareFormTemplateDto {
  @ApiProperty({ required: false, enum: CareTargetType })
  @IsOptional()
  @IsEnum(CareTargetType)
  targetType?: CareTargetType;

  @ApiProperty({ required: false, enum: CareFormDepartment })
  @IsOptional()
  @IsEnum(CareFormDepartment)
  department?: CareFormDepartment;
}
