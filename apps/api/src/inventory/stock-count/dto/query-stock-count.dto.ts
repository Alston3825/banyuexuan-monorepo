import { ApiProperty } from '@nestjs/swagger';
import { InventoryDocStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class QueryStockCountDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() storeId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() warehouseId?: string;
  @ApiProperty({ required: false, enum: InventoryDocStatus }) @IsOptional() @IsEnum(InventoryDocStatus) status?: InventoryDocStatus;
}
