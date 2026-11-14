import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class QueryDinerProfileDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() customerId?: string;
}
