import { ApiProperty } from '@nestjs/swagger';
import { CommonStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateKnowledgeDocumentDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() title?: string;
  @ApiProperty({ required: false, description: '若修改会重新分段并重新生成embedding' }) @IsOptional() @IsString() content?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() category?: string;
  @ApiProperty({ required: false, enum: CommonStatus }) @IsOptional() @IsEnum(CommonStatus) status?: CommonStatus;

  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
