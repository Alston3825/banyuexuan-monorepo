import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class AddApproverDto {
  @ApiProperty() @IsString() accountId: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() comment?: string;
}
