import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateLeadDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() name?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  phone?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() remark?: string;

  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
