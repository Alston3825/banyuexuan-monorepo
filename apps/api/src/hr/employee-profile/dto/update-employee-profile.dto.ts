import { ApiProperty } from '@nestjs/swagger';
import { EmployeeContractType, EmployeeProfileStatus, EmploymentType, SocialInsuranceStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

/** 字符串字段传空字符串 = 清空；不传 = 不修改。 */
export class UpdateEmployeeProfileDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() employeeNo?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() hireDate?: string;
  @ApiProperty({ required: false, enum: EmploymentType }) @IsOptional() @IsEnum(EmploymentType) employmentType?: EmploymentType;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() healthCertExpiresAt?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() contractExpiresAt?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() probationEndsAt?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() terminationDate?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(191) terminationReason?: string;
  @ApiProperty({ required: false, enum: EmployeeProfileStatus }) @IsOptional() @IsEnum(EmployeeProfileStatus) status?: EmployeeProfileStatus;
  @ApiProperty({ required: false }) @IsOptional() @IsString() remark?: string;

  @ApiProperty({ required: false, enum: EmployeeContractType }) @IsOptional() @IsEnum(EmployeeContractType) contractType?: EmployeeContractType;
  @ApiProperty({ required: false, enum: SocialInsuranceStatus }) @IsOptional() @IsEnum(SocialInsuranceStatus) socialInsurance?: SocialInsuranceStatus;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(18) idCardNo?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(32) bankAccountNo?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(100) bankName?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(50) emergencyContactName?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(30) emergencyContactPhone?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(30) emergencyContactRelation?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(255) address?: string;

  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
