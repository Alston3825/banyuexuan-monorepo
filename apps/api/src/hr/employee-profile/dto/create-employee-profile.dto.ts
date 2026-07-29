import { ApiProperty } from '@nestjs/swagger';
import { EmploymentType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateEmployeeProfileDto {
  @ApiProperty() @IsString() accountId: string;
  @ApiProperty() @IsString() employeeNo: string;
  @ApiProperty() @IsDateString() hireDate: string;
  @ApiProperty({ required: false, enum: EmploymentType, default: 'EMPLOYEE' })
  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() healthCertExpiresAt?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() contractExpiresAt?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() probationEndsAt?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() remark?: string;
}
