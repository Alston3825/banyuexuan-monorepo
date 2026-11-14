import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class CompleteCareOutreachTaskDto {
  @ApiProperty({ enum: ['COMPLETED', 'SKIPPED'] }) @IsIn(['COMPLETED', 'SKIPPED']) status: 'COMPLETED' | 'SKIPPED';
  @ApiProperty({ required: false }) @IsOptional() @IsString() completionNote?: string;
}
