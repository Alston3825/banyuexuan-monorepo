import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateTeamDto {
  @ApiProperty({ required: false, description: '不填则系统自动生成' })
  @IsOptional()
  @IsString()
  code?: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() departmentId: string;
}
