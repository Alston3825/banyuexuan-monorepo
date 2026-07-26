import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateDepartmentDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ required: false, description: '为空表示总部/跨店部门' })
  @IsOptional()
  @IsString()
  storeId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() parentId?: string;
}
