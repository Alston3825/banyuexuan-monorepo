import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class ResolveCareAbnormalityDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() resolveNote?: string;
  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
