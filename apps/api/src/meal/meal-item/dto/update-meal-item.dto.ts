import { ApiProperty } from '@nestjs/swagger';
import { MealSlot } from '@prisma/client';
import { IsArray, IsEnum, IsIn, IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateMealItemDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() name?: string;
  @ApiProperty({ required: false, enum: MealSlot }) @IsOptional() @IsEnum(MealSlot) defaultSlot?: MealSlot;
  @ApiProperty({ required: false }) @IsOptional() @IsArray() ingredientTags?: string[];
  @ApiProperty({ required: false, enum: ['ACTIVE', 'INACTIVE'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
