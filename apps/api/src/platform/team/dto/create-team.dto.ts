import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateTeamDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() departmentId: string;
}
