import { ApiProperty } from '@nestjs/swagger';
import { UtilityExpenseType } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export class CreateUtilityExpenseDto {
  @ApiProperty() @IsString() storeId: string;
  @ApiProperty({ description: '格式 YYYY-MM' })
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'period 格式应为 YYYY-MM' })
  period: string;
  @ApiProperty({ enum: UtilityExpenseType }) @IsEnum(UtilityExpenseType) expenseType: UtilityExpenseType;
  @ApiProperty({ description: '金额，最小货币单位（分）' }) @IsInt() @Min(1) amount: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() remark?: string;
}
