import { ApiProperty } from '@nestjs/swagger';
import { CustomerSource, ReferrerType } from '@prisma/client';
import { IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Matches } from 'class-validator';
import { CUSTOMER_SERVICE_TYPES } from './customer-service-type.const';

/**
 * 所有字段可选；传 null 表示清空该项（@IsOptional 对 null 和 undefined 都跳过校验），
 * 不传表示不修改。
 */
export class UpdateCustomerDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() name?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  phone?: string;
  @ApiProperty({ required: false, description: '修改手机号时，再次入住的妈妈允许与已有客户重复' }) @IsOptional() @IsBoolean() allowDuplicatePhone?: boolean;
  @ApiProperty({ required: false, description: '渠道类型 id' }) @IsOptional() @IsString() channelTypeId?: string;
  @ApiProperty({ required: false, enum: CustomerSource, description: '旧版 6 类渠道（内部调用用）' }) @IsOptional() @IsEnum(CustomerSource) source?: CustomerSource;
  @ApiProperty({ required: false }) @IsOptional() @IsString() channelId?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsString() assignedToId?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsString() phoneSalesId?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsString() wechat?: string | null;
  @ApiProperty({ required: false, enum: CUSTOMER_SERVICE_TYPES, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(CUSTOMER_SERVICE_TYPES, { each: true })
  serviceTypes?: string[];
  @ApiProperty({ required: false }) @IsOptional() @IsString() hospital?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() expectedDueDate?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsString() region?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsString() address?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsString() zone?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsString() remark?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsString() idCardNo?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() birthday?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsString() dietTaboo?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsString() hisNo?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsString() passportNo?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsString() emergencyContactName?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsString() emergencyContactRelation?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsString() emergencyContactPhone?: string | null;
  @ApiProperty({ required: false, enum: ReferrerType }) @IsOptional() @IsEnum(ReferrerType) referrerType?: ReferrerType | null;
  @ApiProperty({ required: false }) @IsOptional() @IsString() referrerId?: string | null;
  @ApiProperty({ required: false }) @IsOptional() @IsArray() @IsString({ each: true }) ccAccountIds?: string[] | null;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() registeredAt?: string;

  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
