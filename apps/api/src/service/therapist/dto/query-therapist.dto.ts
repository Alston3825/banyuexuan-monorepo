import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class QueryTherapistDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() storeId?: string;
}
