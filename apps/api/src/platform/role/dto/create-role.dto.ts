import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() description?: string;
}
