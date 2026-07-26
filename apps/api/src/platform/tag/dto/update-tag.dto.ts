import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateTagDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() name?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() color?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() category?: string;

  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
