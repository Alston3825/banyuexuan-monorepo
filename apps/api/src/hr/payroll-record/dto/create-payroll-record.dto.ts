import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export class CreatePayrollRecordDto {
  @ApiProperty() @IsString() storeId: string;
  @ApiProperty() @IsString() employeeProfileId: string;
  @ApiProperty({ description: '格式 YYYY-MM' })
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'period 格式应为 YYYY-MM' })
  period: string;
  @ApiProperty({ description: '底薪，最小货币单位' }) @IsInt() @Min(0) baseSalary: number;
  @ApiProperty({ required: false, description: '扣款，最小货币单位' }) @IsOptional() @IsInt() @Min(0) deductions?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() remark?: string;
}
