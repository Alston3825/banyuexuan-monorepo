import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString } from 'class-validator';

export class AssignLeadDto {
  @ApiProperty() @IsString() assignedToId: string;
  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
