import { ApiProperty } from '@nestjs/swagger';
import { PayrollRecordStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class QueryPayrollRecordDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() storeId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() employeeProfileId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() period?: string;
  @ApiProperty({ required: false, enum: PayrollRecordStatus }) @IsOptional() @IsEnum(PayrollRecordStatus) status?: PayrollRecordStatus;
}
