import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateVehicleDto {
  @ApiProperty() @IsString() plateNumber: string;
  @ApiProperty() @IsString() model: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() remark?: string;
}
