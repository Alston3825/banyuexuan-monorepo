import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateStoreDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() name?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() address?: string;
  @ApiProperty({ required: false, enum: ['PENDING', 'ACTIVE', 'CLOSED'] })
  @IsOptional()
  @IsIn(['PENDING', 'ACTIVE', 'CLOSED'])
  status?: 'PENDING' | 'ACTIVE' | 'CLOSED';

  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
