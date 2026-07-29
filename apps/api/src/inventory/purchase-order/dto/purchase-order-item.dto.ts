import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Min } from 'class-validator';

export class PurchaseOrderItemDto {
  @ApiProperty() @IsString() itemId: string;
  @ApiProperty() @IsInt() @Min(1) quantity: number;
  @ApiProperty({ description: '采购单价，最小货币单位' }) @IsInt() @Min(0) unitPrice: number;
}
