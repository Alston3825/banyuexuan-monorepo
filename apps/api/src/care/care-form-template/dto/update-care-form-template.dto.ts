import { ApiProperty } from '@nestjs/swagger';
import { CareFormScene } from '@prisma/client';
import { IsArray, IsEnum, IsIn, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CareFormTemplateFieldDto } from './care-form-template-field.dto';

export class UpdateCareFormTemplateDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() name?: string;
  @ApiProperty({ required: false, enum: CareFormScene }) @IsOptional() @IsEnum(CareFormScene) scene?: CareFormScene;

  @ApiProperty({ required: false, enum: ['ACTIVE', 'INACTIVE'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @ApiProperty({
    required: false,
    type: [CareFormTemplateFieldDto],
    description: '不传则不改字段绑定；传了则整体替换为这个新的字段列表',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CareFormTemplateFieldDto)
  fields?: CareFormTemplateFieldDto[];

  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
