import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreateOpportunityDto {
  @ApiProperty() @IsString() customerId: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() leadId?: string;
  @ApiProperty({ required: false, description: '意向金额，最小货币单位（分）' })
  @IsOptional()
  @IsInt()
  amount?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() assignedToId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() remark?: string;
}
