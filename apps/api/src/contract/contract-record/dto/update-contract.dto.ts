import { ApiProperty } from '@nestjs/swagger';
import { CareMode, ContractOrientation, PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class ContractItemDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() quantity?: string | null;
  @ApiProperty({ required: false, description: 'AI 没看清、需要销售核对' }) @IsOptional() @IsBoolean() needsReview?: boolean;
}

/**
 * 核对页/编辑页保存的内容。所有字段可选，传 null 表示清空。
 * 金额一律用"分"；日期用 YYYY-MM-DD（合同里的日期都是"日"，不带时间）。
 */
export class UpdateContractDto {
  @ApiProperty({ required: false, description: '纸质合同封面编号' }) @IsOptional() @IsString() paperNo?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() signedDate?: string | null;
  @ApiProperty({ required: false, description: '签单人（销售账号 id）' }) @IsOptional() @IsString() signerId?: string | null;

  @ApiProperty({ required: false }) @IsOptional() @IsString() clientName?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsString() clientPhone?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsString() clientIdCardNo?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsString() clientHospital?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsString() clientAddress?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsString() emergencyName?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsString() emergencyRelation?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsString() emergencyPhone?: string | null;
  @ApiProperty({ required: false, description: 'single / twin / multi' }) @IsOptional() @IsString() fetus?: string | null;
  @ApiProperty({ required: false, description: '合同上的预产期' }) @IsOptional() @IsDateString() dueDate?: string | null;

  @ApiProperty({ required: false }) @IsOptional() @IsString() roomTypeText?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsString() roomTypeId?: string | null;
  @ApiProperty({ required: false, enum: ContractOrientation }) @IsOptional() @IsEnum(ContractOrientation) orientation?: ContractOrientation | null;
  @ApiProperty({ required: false, enum: CareMode }) @IsOptional() @IsEnum(CareMode) careMode?: CareMode | null;
  @ApiProperty({ required: false, description: '入住天数（N+N 的第一个 N）' }) @IsOptional() @IsInt() @Min(0) inHouseDays?: number | null;
  @ApiProperty({ required: false, description: '出所后到家服务天数（第二个 N）' }) @IsOptional() @IsInt() @Min(0) homeServiceDays?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() daysText?: string | null;

  @ApiProperty({ required: false, description: '预估入住日期（销售按预产期推后几天估的，实际入住当天才确定）' })
  @IsOptional()
  @IsDateString()
  estimatedCheckIn?: string | null;
  @ApiProperty({ required: false, description: '预估离店日期；不传则按 预估入住日期 + 入住天数 自动算' })
  @IsOptional()
  @IsDateString()
  estimatedCheckOut?: string | null;

  @ApiProperty({ required: false, description: '套餐金额（分）' }) @IsOptional() @IsInt() @Min(0) amount?: number;
  @ApiProperty({ required: false, description: '订房定金（分）' }) @IsOptional() @IsInt() @Min(0) depositAmount?: number | null;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() depositPaid?: boolean;
  @ApiProperty({ required: false, enum: PaymentMethod }) @IsOptional() @IsEnum(PaymentMethod) depositMethod?: PaymentMethod | null;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() depositPaidAt?: string | null;

  @ApiProperty({ required: false, type: [ContractItemDto], description: '赠送/加购项目，传了就整体替换' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractItemDto)
  items?: ContractItemDto[];

  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
