import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

export class CareFormTemplateFieldDto {
  @ApiProperty() @IsString() fieldId: string;
  @ApiProperty({ required: false, default: false }) @IsOptional() @IsBoolean() required?: boolean;
  @ApiProperty({ required: false, default: 0 }) @IsOptional() @IsInt() sortOrder?: number;
}
