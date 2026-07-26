import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateRegionDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
}
