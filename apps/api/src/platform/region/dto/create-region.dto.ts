import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateRegionDto {
  @ApiProperty({ required: false, description: '不填则系统自动生成' })
  @IsOptional()
  @IsString()
  code?: string;
  @ApiProperty() @IsString() name: string;
}
