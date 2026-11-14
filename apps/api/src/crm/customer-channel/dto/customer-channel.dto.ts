import { ApiProperty } from '@nestjs/swagger';
import { CommonStatus } from '@prisma/client';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

// ---------------- 渠道类型 ----------------

export class CreateChannelTypeDto {
  @ApiProperty({ description: '渠道类型名称，如 医院合作、美团点评' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  name: string;
}

export class UpdateChannelTypeDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() @IsNotEmpty() @MaxLength(30) name?: string;
  @ApiProperty({ required: false, enum: CommonStatus, description: '停用后新建客户时不再可选，已有客户不受影响' })
  @IsOptional()
  @IsEnum(CommonStatus)
  status?: CommonStatus;
  @ApiProperty({ required: false, description: '排序，小的在前' }) @IsOptional() @IsInt() @Min(0) sortOrder?: number;

  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}

// ---------------- 具体渠道 ----------------

export class CreateCustomerChannelDto {
  @ApiProperty({ description: '所属渠道类型 id' })
  @IsString()
  @IsNotEmpty()
  typeId: string;

  @ApiProperty({ description: '具体渠道名称，如 小红书、某某医院合作' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;
}

export class UpdateCustomerChannelDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() @IsNotEmpty() @MaxLength(50) name?: string;
  @ApiProperty({ required: false, enum: CommonStatus, description: '停用后新建客户时不再可选，已有客户不受影响' })
  @IsOptional()
  @IsEnum(CommonStatus)
  status?: CommonStatus;

  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}

export class QueryCustomerChannelDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() typeId?: string;
  @ApiProperty({ required: false, enum: CommonStatus }) @IsOptional() @IsEnum(CommonStatus) status?: CommonStatus;
}
