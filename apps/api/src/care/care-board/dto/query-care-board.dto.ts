import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class QueryCareBoardDto {
  @ApiProperty() @IsString() storeId: string;
  @ApiProperty({ required: false, description: '查询日期，默认今天' })
  @IsOptional()
  @IsDateString()
  date?: string;
}
