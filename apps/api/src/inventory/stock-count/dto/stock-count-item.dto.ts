import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Min } from 'class-validator';

export class StockCountItemDto {
  @ApiProperty() @IsString() itemId: string;
  @ApiProperty({ description: '实际盘点数量' }) @IsInt() @Min(0) countedQuantity: number;
}
