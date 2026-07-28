import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateDinerProfileDto {
  @ApiProperty() @IsString() customerId: string;
  @ApiProperty() @IsString() mealPlanTemplateId: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() occupancyId?: string;
  @ApiProperty({ description: '方案第1天对应的日期，通常=入住日' }) @IsDateString() startDate: string;
  @ApiProperty({ required: false, description: '禁忌 ID 列表' })
  @IsOptional()
  @IsArray()
  restrictionIds?: string[];
}
