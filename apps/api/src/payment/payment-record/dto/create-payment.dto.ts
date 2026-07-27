import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

export class CreatePaymentDto {
  @ApiProperty() @IsString() contractId: string;
  @ApiProperty() @IsString() customerId: string;
  @ApiProperty() @IsString() storeId: string;
  @ApiProperty({ description: '收款金额，最小货币单位（分）' }) @IsInt() amount: number;
  @ApiProperty({ enum: PaymentMethod, required: false }) @IsOptional() @IsEnum(PaymentMethod) method?: PaymentMethod;
  @ApiProperty({ required: false }) @IsOptional() @IsString() remark?: string;
}
