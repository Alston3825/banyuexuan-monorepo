import { ApiProperty } from '@nestjs/swagger';
import { FollowUpType } from '@prisma/client';
import { IsDateString, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

const BUSINESS_TYPES = ['LEAD', 'OPPORTUNITY', 'CUSTOMER'] as const;

export class CreateFollowUpDto {
  @ApiProperty({ enum: BUSINESS_TYPES })
  @IsIn(BUSINESS_TYPES)
  businessType: (typeof BUSINESS_TYPES)[number];

  @ApiProperty() @IsString() businessId: string;
  @ApiProperty({ enum: FollowUpType }) @IsIn(Object.values(FollowUpType)) type: FollowUpType;
  @ApiProperty() @IsString() @IsNotEmpty() content: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() nextFollowUpAt?: string;
}
