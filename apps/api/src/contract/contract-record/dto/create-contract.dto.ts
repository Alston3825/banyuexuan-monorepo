import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateContractDto {
  @ApiProperty() @IsString() customerId: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() opportunityId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() templateId?: string;
  @ApiProperty() @IsString() storeId: string;
  @ApiProperty() @IsString() title: string;
  @ApiProperty({ description: '合同正文快照，可从模板复制后编辑，也可手写' }) @IsString() content: string;
  @ApiProperty({ description: '合同总金额，最小货币单位（分）' }) @IsInt() amount: number;
  @ApiProperty() @IsDateString() startDate: string;
  @ApiProperty() @IsDateString() endDate: string;
}
