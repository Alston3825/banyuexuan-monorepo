import { ApiProperty } from '@nestjs/swagger';
import { DeliveryMethod } from '@prisma/client';
import { IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { BabyProfileInputDto } from './baby-profile-input.dto';

export class CreateMotherProfileDto {
  @ApiProperty() @IsString() customerId: string;
  @ApiProperty({ required: false, description: '关联的入住记录（可为空，建档时未必已排房）' })
  @IsOptional()
  @IsString()
  occupancyId?: string;

  @ApiProperty({ required: false, enum: DeliveryMethod })
  @IsOptional()
  @IsEnum(DeliveryMethod)
  deliveryMethod?: DeliveryMethod;

  @ApiProperty({ required: false }) @IsOptional() @IsDateString() deliveryDate?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() gestationalWeeks?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() expectedDeliveryDate?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() remark?: string;

  @ApiProperty({ required: false, description: '风险标签 ID 列表（早产/传染病/高敏/妈咪住院等）' })
  @IsOptional()
  @IsArray()
  riskTagIds?: string[];

  @ApiProperty({ required: false, type: [BabyProfileInputDto], description: '随档同时建立的宝宝档案（多胞胎传多条）' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BabyProfileInputDto)
  babies?: BabyProfileInputDto[];
}
