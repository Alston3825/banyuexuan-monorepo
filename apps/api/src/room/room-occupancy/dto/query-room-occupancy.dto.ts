import { ApiProperty } from '@nestjs/swagger';
import { RoomOccupancyStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class QueryRoomOccupancyDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() storeId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() roomId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() customerId?: string;
  @ApiProperty({ required: false, enum: RoomOccupancyStatus })
  @IsOptional()
  @IsEnum(RoomOccupancyStatus)
  status?: RoomOccupancyStatus;
}
