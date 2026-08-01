import { ApiProperty } from '@nestjs/swagger';
import { CommonStatus } from '@prisma/client';
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CareOutreachTemplateItemDto } from './care-outreach-template-item.dto';

export class UpdateCareOutreachTemplateDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() name?: string;
  @ApiProperty({ required: false, enum: CommonStatus }) @IsOptional() @IsEnum(CommonStatus) status?: CommonStatus;

  @ApiProperty({ type: [CareOutreachTemplateItemDto], required: false, description: '若提供则整体替换关怀节点列表' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CareOutreachTemplateItemDto)
  items?: CareOutreachTemplateItemDto[];

  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
