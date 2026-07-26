import { ApiProperty } from '@nestjs/swagger';
import { LeadStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class QueryLeadDto {
  @ApiProperty({ required: false, enum: LeadStatus }) @IsOptional() @IsEnum(LeadStatus) status?: LeadStatus;
  @ApiProperty({ required: false }) @IsOptional() @IsString() assignedToId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() storeId?: string;
}
