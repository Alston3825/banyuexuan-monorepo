import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class QueryServiceReportDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() storeId?: string;
  @ApiProperty({ required: false, description: '按 scheduledAt 起始日期过滤（含）' }) @IsOptional() @IsDateString() startDate?: string;
  @ApiProperty({ required: false, description: '按 scheduledAt 结束日期过滤（含）' }) @IsOptional() @IsDateString() endDate?: string;
}
