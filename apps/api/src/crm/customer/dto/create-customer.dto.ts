import { ApiProperty } from '@nestjs/swagger';
import { CustomerSource } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';

export class CreateCustomerDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' }) phone: string;
  @ApiProperty({ enum: CustomerSource }) @IsEnum(CustomerSource) source: CustomerSource;
  @ApiProperty({ required: false }) @IsOptional() @IsString() primaryStoreId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() assignedToId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() remark?: string;
}
