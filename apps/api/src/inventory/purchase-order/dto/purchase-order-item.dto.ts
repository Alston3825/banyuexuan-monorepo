import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/** 之前没采购过、物品库里还没有的新物品：创建采购单时自动加入物品库（需要写明单位） */
export class NewPurchaseItemDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() spec?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() brand?: string;
  @ApiProperty({ description: '计量单位，如 个/箱/桶' }) @IsString() @IsNotEmpty() unit: string;
}

export class PurchaseOrderItemDto {
  @ApiProperty({ required: false, description: '物品库里已有的物品；新物品不传，改传 newItem' }) @IsOptional() @IsString() itemId?: string;
  @ApiProperty({ required: false, type: NewPurchaseItemDto }) @IsOptional() @ValidateNested() @Type(() => NewPurchaseItemDto) newItem?: NewPurchaseItemDto;
  @ApiProperty() @IsInt() @Min(1) quantity: number;
  @ApiProperty({ description: '采购单价，最小货币单位' }) @IsInt() @Min(0) unitPrice: number;
}
