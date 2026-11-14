import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateRoomOccupancyDto {
  @ApiProperty() @IsString() roomId: string;
  @ApiProperty() @IsString() storeId: string;
  @ApiProperty() @IsString() customerId: string;
  @ApiProperty({ required: false, description: '关联合同，可选——允许先预订/入住，合同后补或完全不签' })
  @IsOptional()
  @IsString()
  contractId?: string;
  @ApiProperty() @IsDateString() plannedCheckIn: string;
  @ApiProperty() @IsDateString() plannedCheckOut: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() remark?: string;
}
