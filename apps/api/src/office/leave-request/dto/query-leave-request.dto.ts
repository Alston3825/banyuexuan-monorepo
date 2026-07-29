import { ApiProperty } from '@nestjs/swagger';
import { OfficeApprovalStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class QueryLeaveRequestDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() storeId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() employeeProfileId?: string;
  @ApiProperty({ required: false, enum: OfficeApprovalStatus }) @IsOptional() @IsEnum(OfficeApprovalStatus) status?: OfficeApprovalStatus;
}
