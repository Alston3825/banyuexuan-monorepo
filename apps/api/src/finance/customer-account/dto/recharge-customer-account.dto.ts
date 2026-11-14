import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class RechargeCustomerAccountDto {
  @ApiProperty() @IsString() customerId: string;
  @ApiProperty({ required: false, description: '本次充值的实付本金，最小货币单位（分）' })
  @IsOptional()
  @IsInt()
  @Min(0)
  principalAmount?: number;
  @ApiProperty({ required: false, description: '本次充值的赠送/权益额度，最小货币单位（分）' })
  @IsOptional()
  @IsInt()
  @Min(0)
  giftAmount?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() remark?: string;
}
