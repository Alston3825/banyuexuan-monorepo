import { ApiProperty } from '@nestjs/swagger';
import { MealSlot } from '@prisma/client';
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateMealItemDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ enum: MealSlot }) @IsEnum(MealSlot) defaultSlot: MealSlot;
  @ApiProperty({ required: false, description: '食材标签，用于与食材类禁忌匹配，如 ["蛋","牛肉"]' })
  @IsOptional()
  @IsArray()
  ingredientTags?: string[];
}
