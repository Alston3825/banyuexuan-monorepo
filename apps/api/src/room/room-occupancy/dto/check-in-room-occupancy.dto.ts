import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString } from 'class-validator';

export class CheckInRoomOccupancyDto {
  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;

  @ApiPropertyOptional({ description: '实际安排的房间（不传=预订时的房间）' })
  @IsOptional()
  @IsString()
  roomId?: string;

  @ApiPropertyOptional({ description: '实际入住日期（不传=现在）' })
  @IsOptional()
  @IsDateString()
  checkInDate?: string;

  @ApiPropertyOptional({ description: '计划离店日期（按实际入住天数算出；不传=沿用预订的）' })
  @IsOptional()
  @IsDateString()
  plannedCheckOut?: string;

  @ApiPropertyOptional({ description: '目标房间上一位客户已过预计离店日却没办离店：确认他已离开，同时替他办离店' })
  @IsOptional()
  @IsBoolean()
  releaseOverdue?: boolean;
}
