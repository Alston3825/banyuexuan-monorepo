import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateAccountDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() realName?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() phone?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() email?: string;
  @ApiProperty({ required: false, nullable: true, description: '传 null 表示清空' }) @IsOptional() @IsString() storeId?: string | null;
  @ApiProperty({ required: false, nullable: true }) @IsOptional() @IsString() departmentId?: string | null;
  @ApiProperty({ required: false, nullable: true }) @IsOptional() @IsString() teamId?: string | null;
  @ApiProperty({ required: false, nullable: true }) @IsOptional() @IsString() positionId?: string | null;
  @ApiProperty({ required: false, enum: ['ACTIVE', 'DISABLED', 'LOCKED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'DISABLED', 'LOCKED'])
  status?: 'ACTIVE' | 'DISABLED' | 'LOCKED';

  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
