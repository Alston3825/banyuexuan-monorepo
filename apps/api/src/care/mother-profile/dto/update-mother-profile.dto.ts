import { ApiProperty } from '@nestjs/swagger';
import { DeliveryMethod } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateMotherProfileDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() occupancyId?: string;
  @ApiProperty({ required: false, enum: DeliveryMethod }) @IsOptional() @IsEnum(DeliveryMethod) deliveryMethod?: DeliveryMethod;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() deliveryDate?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() gestationalWeeks?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() expectedDeliveryDate?: string;
  @ApiProperty({ required: false, description: '护理要点/医嘱：护理看板卡片上展示的简短提示' }) @IsOptional() @IsString() careNote?: string;
  @ApiProperty({ required: false, nullable: true, description: '主责护理师（员工账号 ID）；传 null 表示清除' }) @IsOptional() @IsString() primaryNurseId?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsString() remark?: string;

  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
