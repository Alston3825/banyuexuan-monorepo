import { ApiProperty } from '@nestjs/swagger';
import { RoomRequisitionStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class QueryRoomServiceRequisitionDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() occupancyId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() storeId?: string;
  @ApiProperty({ required: false, enum: RoomRequisitionStatus })
  @IsOptional()
  @IsEnum(RoomRequisitionStatus)
  status?: RoomRequisitionStatus;
}
