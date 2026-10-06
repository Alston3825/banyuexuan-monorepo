import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsInt } from 'class-validator';

export class RescheduleRoomOccupancyDto {
  @ApiProperty({ description: '新的计划入住日期' }) @IsDateString() plannedCheckIn: string;
  @ApiProperty({ description: '新的计划离店日期' }) @IsDateString() plannedCheckOut: string;

  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
