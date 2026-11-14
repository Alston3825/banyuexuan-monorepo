import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class CcDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  accountIds: string[];
}
