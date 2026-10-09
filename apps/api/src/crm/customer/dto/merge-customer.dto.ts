import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class MergeCustomerDto {
  @ApiProperty({ description: '要被合并掉的重复客户（合并后进回收站）' })
  @IsString()
  sourceId!: string;

  @ApiProperty({ description: '保留下来的客户（所有数据并入它）' })
  @IsString()
  targetId!: string;
}
