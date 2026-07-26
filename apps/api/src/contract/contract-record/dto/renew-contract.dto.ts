import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString } from 'class-validator';

export class RenewContractDto {
  @ApiProperty() @IsDateString() startDate: string;
  @ApiProperty() @IsDateString() endDate: string;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() amount?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() content?: string;

  @ApiProperty({ description: '原合同的乐观锁版本号' })
  @IsInt()
  version: number;
}
