import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class AnalyzeBusinessDto {
  @ApiProperty({ required: false, description: '不传：店长自动限定本店，超级管理员汇总全租户' }) @IsOptional() @IsString() storeId?: string;
  @ApiProperty({ description: '起始日期（含），格式 YYYY-MM-DD' }) @IsDateString() startDate: string;
  @ApiProperty({ description: '结束日期（含），格式 YYYY-MM-DD' }) @IsDateString() endDate: string;
}
