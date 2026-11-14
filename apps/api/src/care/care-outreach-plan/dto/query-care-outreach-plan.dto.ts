import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class QueryCareOutreachPlanDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() motherProfileId?: string;
}
