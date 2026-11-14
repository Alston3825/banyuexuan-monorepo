import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateRoomCallDto {
  @ApiProperty() @IsString() occupancyId: string;
  @ApiProperty() @IsString() @IsNotEmpty() reason: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() remark?: string;
}
