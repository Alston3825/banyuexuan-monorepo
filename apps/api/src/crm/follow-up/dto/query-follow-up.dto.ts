import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

const BUSINESS_TYPES = ['LEAD', 'OPPORTUNITY', 'CUSTOMER'] as const;

export class QueryFollowUpDto {
  @ApiProperty({ enum: BUSINESS_TYPES })
  @IsIn(BUSINESS_TYPES)
  businessType: (typeof BUSINESS_TYPES)[number];

  @ApiProperty() @IsString() businessId: string;
}
