import { ApiProperty } from '@nestjs/swagger';
import { BabyGender } from '@prisma/client';
import { IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

/** 建档时随妈妈档案一起创建的宝宝信息（不含 motherProfileId，由所属妈妈档案隐含）。 */
export class BabyProfileInputDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() name?: string;
  @ApiProperty({ required: false, enum: BabyGender }) @IsOptional() @IsEnum(BabyGender) gender?: BabyGender;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() birthDate?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() birthWeightGrams?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() apgarScore?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() remark?: string;

  @ApiProperty({ required: false, description: '风险标签 ID 列表（早产/宝宝住院/宝宝托管等）' })
  @IsOptional()
  @IsArray()
  riskTagIds?: string[];
}
