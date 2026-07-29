import { ApiProperty } from '@nestjs/swagger';
import { CommissionRecordStatus, CommissionType } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class QueryCommissionRecordDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() storeId?: string;
  @ApiProperty({ required: false, enum: CommissionType }) @IsOptional() @IsEnum(CommissionType) type?: CommissionType;
  @ApiProperty({ required: false, enum: CommissionRecordStatus }) @IsOptional() @IsEnum(CommissionRecordStatus) status?: CommissionRecordStatus;
}
