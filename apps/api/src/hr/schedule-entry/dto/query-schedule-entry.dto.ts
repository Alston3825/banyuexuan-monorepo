import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class QueryScheduleEntryDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() storeId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() employeeProfileId?: string;
  @ApiProperty({ required: false, description: '起始日期(含)' }) @IsOptional() @IsDateString() startDate?: string;
  @ApiProperty({ required: false, description: '结束日期(含)' }) @IsOptional() @IsDateString() endDate?: string;
}
