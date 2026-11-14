import { ApiProperty } from '@nestjs/swagger';
import { CustomerSource, LeadAppointmentType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, Matches } from 'class-validator';

export class CreateLeadDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' }) phone: string;
  @ApiProperty({ enum: CustomerSource }) @IsEnum(CustomerSource) source: CustomerSource;
  @ApiProperty({ required: false }) @IsOptional() @IsString() storeId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() remark?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() customerId?: string;

  @ApiProperty({ required: false, enum: LeadAppointmentType, description: '预约类型：预约参观/预约试餐' })
  @IsOptional()
  @IsEnum(LeadAppointmentType)
  appointmentType?: LeadAppointmentType;

  @ApiProperty({ required: false, description: '预约到店时间' }) @IsOptional() @IsDateString() appointmentTime?: string;
  @ApiProperty({ required: false, description: '预约说明' }) @IsOptional() @IsString() appointmentNote?: string;
}
