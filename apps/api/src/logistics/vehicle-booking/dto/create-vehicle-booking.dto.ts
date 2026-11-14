import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsNotEmpty, IsString } from 'class-validator';

export class CreateVehicleBookingDto {
  @ApiProperty() @IsString() vehicleId: string;
  @ApiProperty() @IsString() storeId: string;
  @ApiProperty() @IsString() @IsNotEmpty() purpose: string;
  @ApiProperty() @IsISO8601() startTime: string;
  @ApiProperty() @IsISO8601() endTime: string;
}
