import { ApiProperty } from '@nestjs/swagger';
import { CommissionType } from '@prisma/client';
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CommissionAllocationInputDto } from './commission-allocation-input.dto';

export class CreateCommissionRecordDto {
  @ApiProperty() @IsString() storeId: string;
  @ApiProperty({ enum: CommissionType }) @IsEnum(CommissionType) type: CommissionType;
  @ApiProperty({ description: '触发单据类型，如 PAYMENT / SERVICE_APPOINTMENT / CUSTOMER_SERVICE_PACKAGE' }) @IsString() sourceType: string;
  @ApiProperty() @IsString() sourceId: string;
  @ApiProperty({ description: '本次提成总金额，最小货币单位' }) @IsInt() @Min(1) totalAmount: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() remark?: string;

  @ApiProperty({ type: [CommissionAllocationInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CommissionAllocationInputDto)
  allocations: CommissionAllocationInputDto[];
}
