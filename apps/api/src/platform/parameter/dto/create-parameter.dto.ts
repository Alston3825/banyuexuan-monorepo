import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreateParameterDto {
  @ApiProperty() @IsString() key: string;
  @ApiProperty() @IsString() value: string;
  @ApiProperty({ required: false, enum: ['STRING', 'NUMBER', 'BOOLEAN', 'JSON'] })
  @IsOptional()
  @IsIn(['STRING', 'NUMBER', 'BOOLEAN', 'JSON'])
  valueType?: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON';
  @ApiProperty({ required: false }) @IsOptional() @IsString() description?: string;
  @ApiProperty({ required: false, description: '为空表示租户级/全局默认，非空覆盖到店级' })
  @IsOptional()
  @IsString()
  storeId?: string;
}
