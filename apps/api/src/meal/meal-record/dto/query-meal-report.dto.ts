import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class QueryMealReportDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() storeId?: string;
  @ApiProperty({ required: false, description: '按 scheduledDate 起始日期过滤（含）' }) @IsOptional() @IsDateString() startDate?: string;
  @ApiProperty({ required: false, description: '按 scheduledDate 结束日期过滤（含）' }) @IsOptional() @IsDateString() endDate?: string;
}
