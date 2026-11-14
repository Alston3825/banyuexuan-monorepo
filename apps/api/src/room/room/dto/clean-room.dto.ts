import { ApiProperty } from '@nestjs/swagger';
import { IsInt } from 'class-validator';

export class CleanRoomDto {
  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
