import { ApiProperty } from '@nestjs/swagger';
import { WarehousePurpose } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateWarehouseDto {
  @ApiProperty() @IsString() storeId: string;
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ required: false, enum: WarehousePurpose, default: 'OPERATING' })
  @IsOptional()
  @IsEnum(WarehousePurpose)
  purpose?: WarehousePurpose;
  @ApiProperty({ required: false, default: true, description: '是否需要审批才能执行入库/出库/领用/盘点单' })
  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;
}
