import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class BindTagDto {
  @ApiProperty({ description: '被打标的实体类型，如 "Store"' })
  @IsString()
  entityType: string;

  @ApiProperty() @IsString() entityId: string;
}
