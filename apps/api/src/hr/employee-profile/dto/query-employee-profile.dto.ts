import { ApiProperty } from '@nestjs/swagger';
import { EmployeeProfileStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class QueryEmployeeProfileDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() storeId?: string;
  @ApiProperty({ required: false, enum: EmployeeProfileStatus }) @IsOptional() @IsEnum(EmployeeProfileStatus) status?: EmployeeProfileStatus;
  @ApiProperty({ required: false, description: '部门' }) @IsOptional() @IsString() departmentId?: string;
  @ApiProperty({ required: false, description: '按姓名/工号搜索' }) @IsOptional() @IsString() keyword?: string;
}
