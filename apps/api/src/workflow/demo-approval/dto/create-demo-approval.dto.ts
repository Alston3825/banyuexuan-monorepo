import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreateDemoApprovalDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() content: string;
  @ApiProperty({ required: false, description: '最小货币单位（分）' })
  @IsOptional()
  @IsInt()
  amount?: number;
}
