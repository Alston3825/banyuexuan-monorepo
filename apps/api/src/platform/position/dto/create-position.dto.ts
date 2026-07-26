import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreatePositionDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() rank?: number;
}
