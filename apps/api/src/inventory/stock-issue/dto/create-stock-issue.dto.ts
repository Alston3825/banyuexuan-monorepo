import { ApiProperty } from '@nestjs/swagger';
import { StockIssueType } from '@prisma/client';
import { ArrayMinSize, IsArray, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { StockIssueItemDto } from './stock-issue-item.dto';

export class CreateStockIssueDto {
  @ApiProperty() @IsString() storeId: string;
  @ApiProperty() @IsString() warehouseId: string;
  @ApiProperty({ required: false, enum: StockIssueType, default: 'ISSUE' })
  @IsOptional()
  @IsEnum(StockIssueType)
  issueType?: StockIssueType;
  @ApiProperty({ required: false, description: '领用类型时登记领用部门/用途' }) @IsOptional() @IsString() remark?: string;

  @ApiProperty({ type: [StockIssueItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockIssueItemDto)
  items: StockIssueItemDto[];
}
