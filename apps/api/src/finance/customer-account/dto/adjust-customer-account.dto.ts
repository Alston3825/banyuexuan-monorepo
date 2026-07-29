import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString } from 'class-validator';

export class AdjustCustomerAccountDto {
  @ApiProperty() @IsString() customerId: string;
  @ApiProperty({ description: '本金调整量，可正可负，最小货币单位（分）' }) @IsInt() principalDelta: number;
  @ApiProperty({ description: '赠送余额调整量，可正可负，最小货币单位（分）' }) @IsInt() giftDelta: number;
  @ApiProperty({ description: '调整原因' }) @IsString() @IsNotEmpty() remark: string;
}
