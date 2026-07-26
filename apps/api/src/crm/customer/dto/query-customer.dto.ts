import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class QueryCustomerDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() assignedToId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() primaryStoreId?: string;
  @ApiProperty({ required: false, description: '按姓名/手机号模糊匹配' })
  @IsOptional()
  @IsString()
  keyword?: string;
}
