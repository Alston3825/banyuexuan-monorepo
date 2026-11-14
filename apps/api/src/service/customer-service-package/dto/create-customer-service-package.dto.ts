import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Min } from 'class-validator';

export class CreateCustomerServicePackageDto {
  @ApiProperty() @IsString() storeId: string;
  @ApiProperty() @IsString() customerId: string;
  @ApiProperty() @IsString() packageId: string;
  @ApiProperty({ description: '实际成交金额（最小货币单位），一般等于套餐 price，允许折扣' })
  @IsInt()
  @Min(0)
  amount: number;
}
