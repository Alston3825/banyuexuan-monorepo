import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class QueryWarehouseDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() storeId?: string;
}
