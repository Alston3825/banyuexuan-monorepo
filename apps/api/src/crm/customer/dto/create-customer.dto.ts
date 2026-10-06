import { ApiProperty } from '@nestjs/swagger';
import { CustomerSource, ReferrerType } from '@prisma/client';
import { IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { CUSTOMER_SERVICE_TYPES } from './customer-service-type.const';

export class CreateCustomerDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' }) phone: string;
  @ApiProperty({
    required: false,
    description: '再次入住的妈妈（二胎等）允许手机号与已有客户重复；不传或 false 时手机号已被使用会被拒绝',
  })
  @IsOptional()
  @IsBoolean()
  allowDuplicatePhone?: boolean;
  @ApiProperty({ required: false, description: '渠道类型 id（客户渠道里维护的类型，可自定义）；和 source 二选一，页面用这个' }) @IsOptional() @IsString() channelTypeId?: string;
  @ApiProperty({ required: false, enum: CustomerSource, description: '旧版 6 类渠道（线索转化、合同自动建客户等内部调用用）；传了会换算成对应的内置渠道类型' })
  @IsOptional()
  @IsEnum(CustomerSource)
  source?: CustomerSource;
  @ApiProperty({ required: false, description: '具体渠道（必须属于上面的渠道类型）' }) @IsOptional() @IsString() channelId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() primaryStoreId?: string;
  @ApiProperty({ required: false, description: '门店销售员（归属销售）；不传默认是录入人' }) @IsOptional() @IsString() assignedToId?: string;
  @ApiProperty({ required: false, description: '电话销售员' }) @IsOptional() @IsString() phoneSalesId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() wechat?: string;
  @ApiProperty({ required: false, enum: CUSTOMER_SERVICE_TYPES, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(CUSTOMER_SERVICE_TYPES, { each: true })
  serviceTypes?: string[];
  @ApiProperty({ required: false }) @IsOptional() @IsString() hospital?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() expectedDueDate?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() region?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() address?: string;
  @ApiProperty({ required: false, description: '片区（如 陆家嘴、世博小区）' }) @IsOptional() @IsString() zone?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() remark?: string;
  @ApiProperty({ required: false, description: '身份证号（测试阶段按普通信息处理，不打码）；填了会校验长度/出生日期/校验位' }) @IsOptional() @IsString() idCardNo?: string;
  @ApiProperty({ required: false, description: '妈妈生日；不传且填了身份证时按身份证自动算' }) @IsOptional() @IsDateString() birthday?: string;
  @ApiProperty({ required: false, description: 'HIS 登记号' }) @IsOptional() @IsString() hisNo?: string;
  @ApiProperty({ required: false, description: '国际证件号（护照等）' }) @IsOptional() @IsString() passportNo?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() emergencyContactName?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() emergencyContactRelation?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() emergencyContactPhone?: string;
  @ApiProperty({ required: false, enum: ReferrerType, description: '推荐人类型：老客户 / 员工，和 referrerId 同时传' })
  @IsOptional()
  @IsEnum(ReferrerType)
  referrerType?: ReferrerType;
  @ApiProperty({ required: false }) @IsOptional() @IsString() referrerId?: string;
  @ApiProperty({ required: false, description: '抄送人（员工账号 id 数组）' }) @IsOptional() @IsArray() @IsString({ each: true }) ccAccountIds?: string[];
  @ApiProperty({ required: false, description: '添加时间，不传默认当前时间（补录历史客户时可填过去的时间）' }) @IsOptional() @IsDateString() registeredAt?: string;
}
