import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class CreateExpenseClaimDto {
  @ApiProperty() @IsString() storeId: string;
  @ApiProperty({ description: '报销金额，最小货币单位（分）' }) @IsInt() @Min(1) amount: number;
  @ApiProperty({ description: '费用类别，如 差旅/办公用品/招待' }) @IsString() @IsNotEmpty() category: string;
  @ApiProperty() @IsString() @IsNotEmpty() reason: string;
}
