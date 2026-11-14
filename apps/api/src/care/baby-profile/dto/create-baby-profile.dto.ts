import { ApiProperty } from '@nestjs/swagger';
import { BabyGender } from '@prisma/client';
import { IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

/** 标准场景是随妈妈档案一起建档（见 CreateMotherProfileDto.babies）；这个接口用于
 * 补建（如建档时漏记、事后确认为多胞胎）单独给已存在的妈妈档案追加一条宝宝档案。 */
export class CreateBabyProfileDto {
  @ApiProperty() @IsString() motherProfileId: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() name?: string;
  @ApiProperty({ required: false, enum: BabyGender }) @IsOptional() @IsEnum(BabyGender) gender?: BabyGender;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() birthDate?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() birthWeightGrams?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() apgarScore?: string;
  @ApiProperty({ required: false, description: '宝宝过敏源' }) @IsOptional() @IsString() allergens?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() remark?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  riskTagIds?: string[];
}
