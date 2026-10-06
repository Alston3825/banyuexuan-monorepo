import { ApiProperty } from '@nestjs/swagger';
import { LeadAppointmentType } from '@prisma/client';
import { IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Matches } from 'class-validator';
import { LEAD_PROCESS_RESULTS } from './lead-process-result.const';

export class UpdateLeadDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() name?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  phone?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() remark?: string;
  @ApiProperty({ required: false, description: '关联客户：人工把这条预约/线索指向一个已有客户档案' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiProperty({ required: false, enum: LeadAppointmentType })
  @IsOptional()
  @IsEnum(LeadAppointmentType)
  appointmentType?: LeadAppointmentType;

  @ApiProperty({ required: false, description: '预约到店时间' }) @IsOptional() @IsDateString() appointmentTime?: string;
  @ApiProperty({ required: false, description: '预约说明' }) @IsOptional() @IsString() appointmentNote?: string;

  @ApiProperty({ required: false, description: '处理状态：未处理/已处理' }) @IsOptional() @IsBoolean() processed?: boolean;
  @ApiProperty({ required: false, enum: LEAD_PROCESS_RESULTS, isArray: true, description: '处理结果，多选' })
  @IsOptional()
  @IsArray()
  @IsIn(LEAD_PROCESS_RESULTS, { each: true })
  processResults?: string[];
  @ApiProperty({ required: false, description: '处理说明' }) @IsOptional() @IsString() handleRemark?: string;

  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
