import { ApiProperty } from '@nestjs/swagger';
import { BabyGender } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateBabyProfileDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() name?: string;
  @ApiProperty({ required: false, enum: BabyGender }) @IsOptional() @IsEnum(BabyGender) gender?: BabyGender;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() birthDate?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() birthWeightGrams?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() apgarScore?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() remark?: string;

  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
