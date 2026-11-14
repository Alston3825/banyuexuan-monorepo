import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/** 物品库里还没有的新物品：创建入库单时自动加入物品库（同名同规格已有的直接用已有的，不会重复建） */
export class NewReceiptItemDto {
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() spec?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() brand?: string;
  @ApiProperty({ description: '计量单位，如 个/箱/桶' }) @IsString() @IsNotEmpty() unit: string;
}

export class GoodsReceiptItemDto {
  @ApiProperty({ required: false, description: '物品库里已有的物品；新物品不传，改传 newItem' }) @IsOptional() @IsString() itemId?: string;
  @ApiProperty({ required: false, type: NewReceiptItemDto }) @IsOptional() @ValidateNested() @Type(() => NewReceiptItemDto) newItem?: NewReceiptItemDto;
  @ApiProperty({ required: false, description: '用已有物品，同时把它的名称改成这个（人工确认“用新名称”时）' }) @IsOptional() @IsString() renameItemTo?: string;
  @ApiProperty() @IsInt() @Min(1) quantity: number;
  @ApiProperty({ description: '入库单位成本，最小货币单位' }) @IsInt() @Min(0) unitCost: number;
}
