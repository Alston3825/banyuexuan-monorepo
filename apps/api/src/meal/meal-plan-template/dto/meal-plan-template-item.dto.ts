import { ApiProperty } from '@nestjs/swagger';
import { MealSlot } from '@prisma/client';
import { IsEnum, IsInt, IsString, Min } from 'class-validator';

export class MealPlanTemplateItemDto {
  @ApiProperty({ description: '第几天，从1开始' }) @IsInt() @Min(1) dayOffset: number;
  @ApiProperty({ enum: MealSlot }) @IsEnum(MealSlot) slot: MealSlot;
  @ApiProperty() @IsString() mealItemId: string;
}
