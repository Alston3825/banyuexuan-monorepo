import { ApiProperty } from '@nestjs/swagger';
import { AiSuggestionScenario, AiSuggestionStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class QueryAiSuggestionDto {
  @ApiProperty({ required: false, enum: AiSuggestionScenario }) @IsOptional() @IsEnum(AiSuggestionScenario) scenario?: AiSuggestionScenario;
  @ApiProperty({ required: false }) @IsOptional() @IsString() businessType?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() businessId?: string;
  @ApiProperty({ required: false, enum: AiSuggestionStatus }) @IsOptional() @IsEnum(AiSuggestionStatus) status?: AiSuggestionStatus;
}
