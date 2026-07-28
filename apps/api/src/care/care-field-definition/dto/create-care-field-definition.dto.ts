import { ApiProperty } from '@nestjs/swagger';
import { CareFieldControlType, CareTargetType } from '@prisma/client';
import { IsArray, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateCareFieldDefinitionDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ enum: CareTargetType }) @IsEnum(CareTargetType) targetType: CareTargetType;
  @ApiProperty({ enum: CareFieldControlType }) @IsEnum(CareFieldControlType) controlType: CareFieldControlType;
  @ApiProperty({ required: false }) @IsOptional() @IsString() unit?: string;

  @ApiProperty({ required: false, description: 'SELECT/RADIO 候选项：[{value,label}]' })
  @IsOptional()
  @IsArray()
  options?: { value: string; label: string }[];

  @ApiProperty({ required: false, description: '数值型字段的正常值下限' })
  @IsOptional()
  @IsNumber()
  normalMin?: number;

  @ApiProperty({ required: false, description: '数值型字段的正常值上限' })
  @IsOptional()
  @IsNumber()
  normalMax?: number;

  @ApiProperty({ required: false, description: '选项型字段的正常值集合（选项 value 数组）' })
  @IsOptional()
  @IsArray()
  normalOptionValues?: string[];

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  visibleToClient?: boolean;
}
