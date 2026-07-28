import { ApiProperty } from '@nestjs/swagger';
import { FollowUpType } from '@prisma/client';
import { IsDateString, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class FollowUpCareAbnormalityDto {
  @ApiProperty({ enum: FollowUpType }) @IsIn(Object.values(FollowUpType)) type: FollowUpType;
  @ApiProperty() @IsString() @IsNotEmpty() content: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() nextFollowUpAt?: string;
}
