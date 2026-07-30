import { ApiProperty } from '@nestjs/swagger';
import { DeviceStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateDeviceDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() name?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() roomId?: string;
  @ApiProperty({ required: false, enum: DeviceStatus, description: '店长可手动置为 DISABLED 下线停用' })
  @IsOptional()
  @IsEnum(DeviceStatus)
  status?: DeviceStatus;

  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
