import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ReassignDto {
  @ApiProperty() @IsString() toAccountId: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() comment?: string;
}
