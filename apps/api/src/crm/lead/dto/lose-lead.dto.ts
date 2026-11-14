import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString } from 'class-validator';

export class LoseLeadDto {
  @ApiProperty() @IsString() @IsNotEmpty() lostReason: string;
  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
