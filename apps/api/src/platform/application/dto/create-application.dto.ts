import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export class CreateApplicationDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ enum: ['WEB', 'MOBILE', 'OPENAPI'] })
  @IsIn(['WEB', 'MOBILE', 'OPENAPI'])
  type: 'WEB' | 'MOBILE' | 'OPENAPI';
}
