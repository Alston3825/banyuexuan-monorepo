import { ApiProperty } from '@nestjs/swagger';
import { CarePlanStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class QueryCarePlanDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() motherProfileId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() babyProfileId?: string;
  @ApiProperty({ required: false, enum: CarePlanStatus }) @IsOptional() @IsEnum(CarePlanStatus) status?: CarePlanStatus;
}
