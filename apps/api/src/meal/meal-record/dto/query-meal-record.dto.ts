import { ApiProperty } from '@nestjs/swagger';
import { MealRecordStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

export class QueryMealRecordDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() dinerProfileId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() scheduledDate?: string;
  @ApiProperty({ required: false, enum: MealRecordStatus }) @IsOptional() @IsEnum(MealRecordStatus) status?: MealRecordStatus;
}
