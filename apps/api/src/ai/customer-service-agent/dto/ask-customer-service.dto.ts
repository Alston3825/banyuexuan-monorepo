import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class AskCustomerServiceDto {
  @ApiProperty({ enum: ['LEAD', 'CUSTOMER'] }) @IsIn(['LEAD', 'CUSTOMER']) businessType: 'LEAD' | 'CUSTOMER';
  @ApiProperty() @IsString() businessId: string;
  @ApiProperty() @IsString() storeId: string;
  @ApiProperty({ description: '员工向AI提出的问题' }) @IsString() @IsNotEmpty() question: string;
}
