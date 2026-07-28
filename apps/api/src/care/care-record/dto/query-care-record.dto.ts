import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class QueryCareRecordDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() motherProfileId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() babyProfileId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() formTemplateId?: string;
}
