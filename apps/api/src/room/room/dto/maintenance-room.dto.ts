import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

export class MaintenanceRoomDto {
  @ApiProperty({ description: '是否置为维修中' }) @IsBoolean() underMaintenance: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsString() note?: string;

  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
