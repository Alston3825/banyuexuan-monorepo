import { ApiProperty } from '@nestjs/swagger';
import { ContractStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export class QueryContractDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() customerId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() storeId?: string;
  @ApiProperty({ required: false, enum: ContractStatus })
  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus;

  @ApiProperty({ required: false, description: '搜索：纸质编号 / 系统编号 / 客户姓名 / 手机号' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiProperty({ required: false, description: '只看"待排房"：已确认、还没有有效预订记录的合同，按签单先后排序' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unassigned?: boolean;
}
