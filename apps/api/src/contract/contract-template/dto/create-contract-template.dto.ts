import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateContractTemplateDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() content: string;
}
