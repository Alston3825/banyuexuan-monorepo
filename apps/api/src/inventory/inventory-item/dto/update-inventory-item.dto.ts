import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateInventoryItemDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() name?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() category?: string;
  @ApiProperty({ required: false, description: '空字符串 = 清空' }) @IsOptional() @IsString() @MaxLength(200) spec?: string;
  @ApiProperty({ required: false, description: '空字符串 = 清空' }) @IsOptional() @IsString() @MaxLength(100) brand?: string;
  @ApiProperty({ required: false, nullable: true, description: '传 null = 清空' }) @IsOptional() @IsNumber() @Min(0) referencePrice?: number | null;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(0) safetyStockThreshold?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(1) shelfLifeDays?: number;
  @ApiProperty({ required: false, enum: ['ACTIVE', 'INACTIVE'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
