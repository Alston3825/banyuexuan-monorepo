import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateKnowledgeDocumentDto {
  @ApiProperty() @IsString() @IsNotEmpty() title: string;
  @ApiProperty() @IsString() @IsNotEmpty() content: string;
  @ApiProperty({ required: false, description: '自由文本分类，如 合同模板说明/护理规范/常见问题' }) @IsOptional() @IsString() category?: string;
}
