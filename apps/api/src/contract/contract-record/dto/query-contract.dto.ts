import { ApiProperty } from '@nestjs/swagger';
import { ContractStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class QueryContractDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() customerId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() storeId?: string;
  @ApiProperty({ required: false, enum: ContractStatus }) @IsOptional() @IsEnum(ContractStatus) status?: ContractStatus;
}
