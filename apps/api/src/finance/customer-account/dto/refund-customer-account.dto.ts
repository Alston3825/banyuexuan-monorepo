import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class RefundCustomerAccountDto {
  @ApiProperty() @IsString() customerId: string;
  @ApiProperty({ required: false, description: '退回本金余额的金额，最小货币单位（分）' })
  @IsOptional()
  @IsInt()
  @Min(0)
  principalAmount?: number;
  @ApiProperty({ required: false, description: '退回赠送余额的金额，最小货币单位（分）' })
  @IsOptional()
  @IsInt()
  @Min(0)
  giftAmount?: number;
  @ApiProperty({ required: false, description: '来源单据类型' }) @IsOptional() @IsString() sourceType?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() sourceId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() remark?: string;
}
