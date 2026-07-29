import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class QueryStockBatchDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() warehouseId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() itemId?: string;
}
