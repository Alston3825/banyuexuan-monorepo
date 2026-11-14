import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateRoomDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() roomTypeId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() roomNo?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() floor?: string;

  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
