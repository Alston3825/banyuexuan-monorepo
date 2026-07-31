import { ApiProperty } from '@nestjs/swagger';
import { ExamQuestionType } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ExamQuestionDto {
  @ApiProperty() @IsInt() order: number;
  @ApiProperty({ enum: ExamQuestionType }) @IsEnum(ExamQuestionType) type: ExamQuestionType;
  @ApiProperty() @IsString() content: string;
  @ApiProperty({ required: false, description: '选择题选项：[{ key, text }]，判断题/简答题为空' })
  @IsOptional()
  options?: { key: string; text: string }[];
  @ApiProperty({
    required: false,
    description: '正确答案：选择题为选项key数组，判断题为 true/false，简答题为空（人工判分）',
  })
  @IsOptional()
  correctAnswer?: unknown;
  @ApiProperty({ description: '该题分值' }) @IsInt() @Min(1) score: number;
}
