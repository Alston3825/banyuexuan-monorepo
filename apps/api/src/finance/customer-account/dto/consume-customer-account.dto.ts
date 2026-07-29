import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ConsumeCustomerAccountDto {
  @ApiProperty() @IsString() customerId: string;
  @ApiProperty({ description: '本次消费金额，最小货币单位（分）' }) @IsInt() @Min(1) amount: number;
  @ApiProperty({ required: false, description: '来源单据类型，如 MANUAL/SERVICE_APPOINTMENT' }) @IsOptional() @IsString() sourceType?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() sourceId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() remark?: string;
}
