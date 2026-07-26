import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class GrantPermissionDto {
  @ApiProperty() @IsString() permissionPointId: string;
}
