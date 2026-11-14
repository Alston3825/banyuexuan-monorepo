import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class QueryPaymentSummaryDto {
  @ApiProperty() @IsString() contractId: string;
}
