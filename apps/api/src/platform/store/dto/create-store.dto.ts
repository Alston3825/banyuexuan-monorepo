import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateStoreDto {
  @ApiProperty({ required: false, description: '不填则系统自动生成' })
  @IsOptional()
  @IsString()
  code?: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() regionId: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() address?: string;
}
