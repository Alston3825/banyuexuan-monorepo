import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateRoomOutingDto {
  @ApiProperty() @IsString() occupancyId: string;
  @ApiProperty() @IsDateString() plannedOutAt: string;
  @ApiProperty() @IsDateString() plannedBackAt: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() riskNote?: string;
}
