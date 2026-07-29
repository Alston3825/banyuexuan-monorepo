import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { GoodsReceiptItemDto } from './goods-receipt-item.dto';

export class CreateGoodsReceiptDto {
  @ApiProperty() @IsString() storeId: string;
  @ApiProperty() @IsString() warehouseId: string;
  @ApiProperty({ required: false, description: '关联的已审批采购单，可空——支持无采购单的临时入库' })
  @IsOptional()
  @IsString()
  purchaseOrderId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() remark?: string;

  @ApiProperty({ type: [GoodsReceiptItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptItemDto)
  items: GoodsReceiptItemDto[];
}
