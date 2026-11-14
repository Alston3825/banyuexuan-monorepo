import { ApiProperty } from '@nestjs/swagger';
import { VehicleStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateVehicleDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() model?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() remark?: string;
  @ApiProperty({ required: false, enum: VehicleStatus }) @IsOptional() @IsEnum(VehicleStatus) status?: VehicleStatus;

  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
