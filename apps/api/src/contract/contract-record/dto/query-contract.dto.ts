import { ApiProperty } from '@nestjs/swagger';
import { ContractStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export class QueryContractDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  customerId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() storeId?: string;
  @ApiProperty({ required: false, enum: ContractStatus })
  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus;

  @ApiProperty({
    required: false,
    description: '仅查询续签合同（renewalOfContractId 不为空）',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isRenewal?: boolean;

  @ApiProperty({ required: false, description: '仅查询指定原合同下的续签记录' })
  @IsOptional()
  @IsString()
  renewalOfContractId?: string;
}
