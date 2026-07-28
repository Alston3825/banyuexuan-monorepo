import { ApiProperty } from '@nestjs/swagger';
import { RoomCallStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class QueryRoomCallDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() occupancyId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() storeId?: string;
  @ApiProperty({ required: false, enum: RoomCallStatus }) @IsOptional() @IsEnum(RoomCallStatus) status?: RoomCallStatus;
}
