import { ApiProperty } from '@nestjs/swagger';
import { RoomOutingStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class QueryRoomOutingDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() occupancyId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() storeId?: string;
  @ApiProperty({ required: false, enum: RoomOutingStatus }) @IsOptional() @IsEnum(RoomOutingStatus) status?: RoomOutingStatus;
}
