import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateScheduleEntryDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() shiftDefinitionId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() remark?: string;

  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
