import { ApiProperty } from '@nestjs/swagger';
import { MealPlanType } from '@prisma/client';
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsOptional, Min, ValidateNested, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { MealPlanTemplateItemDto } from './meal-plan-template-item.dto';

export class CreateMealPlanTemplateDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ enum: MealPlanType }) @IsEnum(MealPlanType) planType: MealPlanType;
  @ApiProperty() @IsInt() @Min(1) totalDays: number;

  @ApiProperty({ required: false, description: '阶段化展示用，如 [{"name":"第1阶段","days":7}]' })
  @IsOptional()
  @IsArray()
  phases?: { name: string; days: number }[];

  @ApiProperty({ type: [MealPlanTemplateItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MealPlanTemplateItemDto)
  items: MealPlanTemplateItemDto[];
}
