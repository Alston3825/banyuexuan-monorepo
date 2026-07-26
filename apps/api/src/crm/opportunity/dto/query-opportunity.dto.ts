import { ApiProperty } from '@nestjs/swagger';
import { OpportunityStage } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class QueryOpportunityDto {
  @ApiProperty({ required: false, enum: OpportunityStage })
  @IsOptional()
  @IsEnum(OpportunityStage)
  stage?: OpportunityStage;
  @ApiProperty({ required: false }) @IsOptional() @IsString() customerId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() assignedToId?: string;
}
