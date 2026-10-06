import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class ConfirmContractDto {
  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;

  @ApiProperty({ required: false, description: '关联到已有客户；不传则按合同上的姓名手机号新建客户' })
  @IsOptional()
  @IsString()
  customerId?: string;
}
