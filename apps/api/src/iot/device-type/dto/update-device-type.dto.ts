import { ApiProperty } from '@nestjs/swagger';
import { CommonStatus, DeviceCategory } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateDeviceTypeDto {
  @ApiProperty({ required: false, enum: DeviceCategory }) @IsOptional() @IsEnum(DeviceCategory) category?: DeviceCategory;
  @ApiProperty({ required: false }) @IsOptional() @IsString() name?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() protocol?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() requiresCommandConfirmation?: boolean;
  @ApiProperty({ required: false, enum: CommonStatus }) @IsOptional() @IsEnum(CommonStatus) status?: CommonStatus;

  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
