import { ApiProperty } from '@nestjs/swagger';
import { DeliveryMethod } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateMotherProfileDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() occupancyId?: string;
  @ApiProperty({ required: false, enum: DeliveryMethod }) @IsOptional() @IsEnum(DeliveryMethod) deliveryMethod?: DeliveryMethod;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() deliveryDate?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() gestationalWeeks?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() expectedDeliveryDate?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() remark?: string;

  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
