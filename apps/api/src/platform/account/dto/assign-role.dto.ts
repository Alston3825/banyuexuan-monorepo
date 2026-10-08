import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';

const SCOPE_TYPES = ['TENANT', 'REGION', 'STORE', 'DEPARTMENT', 'TEAM', 'SELF'] as const;

export class AssignRoleDto {
  @ApiProperty() @IsString() roleId: string;
  @ApiProperty({ enum: SCOPE_TYPES })
  @IsIn(SCOPE_TYPES)
  scopeType: (typeof SCOPE_TYPES)[number];
  @ApiProperty({ required: false, description: 'TENANT/SELF 时可不传' })
  @IsOptional()
  @IsString()
  scopeId?: string;
  @ApiProperty({ required: false, description: '范围对象可多选（如同时管多家门店），每个对象生成一条分配' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopeIds?: string[];
}
