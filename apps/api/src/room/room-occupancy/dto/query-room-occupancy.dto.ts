import { ApiProperty } from '@nestjs/swagger';
import { RoomOccupancyStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

export class QueryRoomOccupancyDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() storeId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() roomId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() customerId?: string;
  @ApiProperty({ required: false, enum: RoomOccupancyStatus })
  @IsOptional()
  @IsEnum(RoomOccupancyStatus)
  status?: RoomOccupancyStatus;

  // from/to：给房态横排时间轴用——查"占用区间跟 [from, to] 有重叠"的记录，不是"createdAt落在这个区间"。
  // 只给了其中一个不做过滤（避免半开区间语义不清），两个都给才生效，见 service 里的重叠判断写法。
  @ApiProperty({ required: false, description: '时间轴窗口起始日期（含），需与to同时提供' }) @IsOptional() @IsDateString() from?: string;
  @ApiProperty({ required: false, description: '时间轴窗口结束日期（含），需与from同时提供' }) @IsOptional() @IsDateString() to?: string;
}
