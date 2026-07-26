import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateParameterDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() value?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() description?: string;

  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
