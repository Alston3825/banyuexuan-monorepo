import { ApiProperty } from '@nestjs/swagger';
import { VehicleBookingStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class QueryVehicleBookingDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() vehicleId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() storeId?: string;
  @ApiProperty({ required: false, enum: VehicleBookingStatus }) @IsOptional() @IsEnum(VehicleBookingStatus) status?: VehicleBookingStatus;
}
