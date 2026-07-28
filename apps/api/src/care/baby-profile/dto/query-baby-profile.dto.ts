import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class QueryBabyProfileDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() motherProfileId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() customerId?: string;
}
