import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString } from 'class-validator';

export class RequestRefundPaymentDto {
  @ApiProperty() @IsString() @IsNotEmpty() refundReason: string;
  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
