import { ApiProperty } from '@nestjs/swagger';
import { CareFormDepartment, CareFormScene, CareTargetType } from '@prisma/client';
import { ArrayMinSize, IsArray, IsEnum, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CareFormTemplateFieldDto } from './care-form-template-field.dto';

export class CreateCareFormTemplateDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ enum: CareTargetType }) @IsEnum(CareTargetType) targetType: CareTargetType;
  @ApiProperty({ enum: CareFormDepartment }) @IsEnum(CareFormDepartment) department: CareFormDepartment;
  @ApiProperty({ enum: CareFormScene, required: false, default: 'GENERAL' })
  @IsEnum(CareFormScene)
  scene: CareFormScene = 'GENERAL';

  @ApiProperty({ type: [CareFormTemplateFieldDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CareFormTemplateFieldDto)
  fields: CareFormTemplateFieldDto[];
}
