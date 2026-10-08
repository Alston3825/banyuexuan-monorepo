import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ArchiveCustomerDto {
  @ApiProperty({ required: false, description: '归档原因（可不填）' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  reason?: string;
}
