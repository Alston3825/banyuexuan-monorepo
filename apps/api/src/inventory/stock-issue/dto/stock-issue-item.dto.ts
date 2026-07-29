import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Min } from 'class-validator';

export class StockIssueItemDto {
  @ApiProperty() @IsString() itemId: string;
  @ApiProperty() @IsInt() @Min(1) quantity: number;
}
