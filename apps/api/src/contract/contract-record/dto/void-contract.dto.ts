import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString } from 'class-validator';

export class VoidContractDto {
  @ApiProperty() @IsString() @IsNotEmpty() voidReason: string;
  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
