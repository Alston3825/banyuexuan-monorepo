import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Min } from 'class-validator';

export class GoodsReceiptItemDto {
  @ApiProperty() @IsString() itemId: string;
  @ApiProperty() @IsInt() @Min(1) quantity: number;
  @ApiProperty({ description: '入库单位成本，最小货币单位' }) @IsInt() @Min(0) unitCost: number;
}
