import { ApiProperty } from '@nestjs/swagger';
import { EmployeeProfileStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateEmployeeProfileDto {
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() healthCertExpiresAt?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() contractExpiresAt?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() probationEndsAt?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() terminationDate?: string;
  @ApiProperty({ required: false, enum: EmployeeProfileStatus }) @IsOptional() @IsEnum(EmployeeProfileStatus) status?: EmployeeProfileStatus;
  @ApiProperty({ required: false }) @IsOptional() @IsString() remark?: string;

  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
