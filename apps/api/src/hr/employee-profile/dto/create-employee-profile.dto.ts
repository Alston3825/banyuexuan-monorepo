import { ApiProperty } from '@nestjs/swagger';
import { EmployeeContractType, EmploymentType, SocialInsuranceStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

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

  // —— 员工信息表字段 ——
  @ApiProperty({ required: false, enum: EmployeeContractType, description: '合同类型' }) @IsOptional() @IsEnum(EmployeeContractType) contractType?: EmployeeContractType;
  @ApiProperty({ required: false, enum: SocialInsuranceStatus, description: '社保缴纳' }) @IsOptional() @IsEnum(SocialInsuranceStatus) socialInsurance?: SocialInsuranceStatus;
  @ApiProperty({ required: false, description: '身份证号（18 位，自动识别性别/出生日期）' }) @IsOptional() @IsString() @MaxLength(18) idCardNo?: string;
  @ApiProperty({ required: false, description: '工资卡账号' }) @IsOptional() @IsString() @MaxLength(32) bankAccountNo?: string;
  @ApiProperty({ required: false, description: '开户行' }) @IsOptional() @IsString() @MaxLength(100) bankName?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(50) emergencyContactName?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(30) emergencyContactPhone?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(30) emergencyContactRelation?: string;
  @ApiProperty({ required: false, description: '现住址' }) @IsOptional() @IsString() @MaxLength(255) address?: string;
}
