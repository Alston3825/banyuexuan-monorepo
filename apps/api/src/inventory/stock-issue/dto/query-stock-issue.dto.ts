import { ApiProperty } from '@nestjs/swagger';
import { InventoryDocStatus, StockIssueType } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class QueryStockIssueDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() storeId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() warehouseId?: string;
  @ApiProperty({ required: false, enum: StockIssueType }) @IsOptional() @IsEnum(StockIssueType) issueType?: StockIssueType;
  @ApiProperty({ required: false, enum: InventoryDocStatus }) @IsOptional() @IsEnum(InventoryDocStatus) status?: InventoryDocStatus;
}
