import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsIn, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { MealPlanTemplateItemDto } from './meal-plan-template-item.dto';

export class UpdateMealPlanTemplateDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() name?: string;

  @ApiProperty({ required: false, enum: ['ACTIVE', 'INACTIVE'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @ApiProperty({ required: false, type: [MealPlanTemplateItemDto], description: '不传则不改排期；传了则整体替换' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MealPlanTemplateItemDto)
  items?: MealPlanTemplateItemDto[];

  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
