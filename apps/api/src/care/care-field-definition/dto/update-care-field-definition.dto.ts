import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateCareFieldDefinitionDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() name?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() unit?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  options?: { value: string; label: string }[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  normalMin?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  normalMax?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  normalOptionValues?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  visibleToClient?: boolean;

  @ApiProperty({ required: false, enum: ['ACTIVE', 'INACTIVE'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
