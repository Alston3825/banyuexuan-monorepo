import { ApiProperty } from '@nestjs/swagger';
import { InventoryDocStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class QueryStockTransferDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() fromWarehouseId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() toWarehouseId?: string;
  @ApiProperty({ required: false, enum: InventoryDocStatus }) @IsOptional() @IsEnum(InventoryDocStatus) status?: InventoryDocStatus;
}
