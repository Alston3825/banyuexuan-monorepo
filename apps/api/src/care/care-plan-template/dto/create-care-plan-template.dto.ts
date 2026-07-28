import { ApiProperty } from '@nestjs/swagger';
import { CareTargetType } from '@prisma/client';
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CarePlanTemplateItemDto } from './care-plan-template-item.dto';

export class CreateCarePlanTemplateDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ enum: CareTargetType }) @IsEnum(CareTargetType) targetType: CareTargetType;
  @ApiProperty() @IsInt() @Min(1) totalDays: number;

  @ApiProperty({ type: [CarePlanTemplateItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CarePlanTemplateItemDto)
  items: CarePlanTemplateItemDto[];
}
