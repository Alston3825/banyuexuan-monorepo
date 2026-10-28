import { ApiProperty } from '@nestjs/swagger';
import { WarehousePurpose } from '@prisma/client';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateInventoryItemDto {
  @ApiProperty({ required: false, description: '不填则自动生成（WP0001 这样的格式）' }) @IsOptional() @IsString() code?: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ description: '计量单位，如 件/kg/箱' }) @IsString() unit: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() category?: string;
  @ApiProperty({ required: false, description: '规格/型号/尺寸' }) @IsOptional() @IsString() @MaxLength(200) spec?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(100) brand?: string;
  @ApiProperty({ required: false, description: '参考单价（按计量单位）' }) @IsOptional() @IsNumber() @Min(0) referencePrice?: number;
  @ApiProperty({ required: false, enum: WarehousePurpose, default: 'OPERATING' })
  @IsOptional()
  @IsEnum(WarehousePurpose)
  purpose?: WarehousePurpose;
  @ApiProperty({ required: false, description: '低于此数量触发低库存预警，不填=不预警' })
  @IsOptional()
  @IsInt()
  @Min(0)
  safetyStockThreshold?: number;
  @ApiProperty({ required: false, description: '保质期天数，不填=不追踪效期' })
  @IsOptional()
  @IsInt()
  @Min(1)
  shelfLifeDays?: number;
}
