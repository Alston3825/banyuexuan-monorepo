import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class QueryMotherProfileDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() customerId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() storeId?: string;
  @ApiProperty({ required: false, description: '归档：不传=只看未归档；only=只看已归档；all=全部' }) @IsOptional() @IsIn(['only', 'all']) archived?: 'only' | 'all';
}
