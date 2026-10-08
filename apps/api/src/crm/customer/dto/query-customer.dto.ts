import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class QueryCustomerDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() assignedToId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() primaryStoreId?: string;
  @ApiProperty({ required: false, description: '按姓名/手机号模糊匹配' })
  @IsOptional()
  @IsString()
  keyword?: string;
  @ApiProperty({ required: false, description: '归档：不传=只看未归档；only=只看已归档；all=全部' })
  @IsOptional()
  @IsIn(['only', 'all'])
  archived?: 'only' | 'all';
}
