import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsIn, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CarePlanTemplateItemDto } from './care-plan-template-item.dto';

export class UpdateCarePlanTemplateDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() name?: string;

  @ApiProperty({ required: false, enum: ['ACTIVE', 'INACTIVE'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @ApiProperty({
    required: false,
    type: [CarePlanTemplateItemDto],
    description: '不传则不改天数排期；传了则整体替换',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CarePlanTemplateItemDto)
  items?: CarePlanTemplateItemDto[];

  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
