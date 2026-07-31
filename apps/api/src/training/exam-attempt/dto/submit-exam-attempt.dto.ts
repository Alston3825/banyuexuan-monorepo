import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ExamAnswerInputDto {
  @ApiProperty() @IsString() questionId: string;
  @ApiProperty({ required: false, description: '选择题/判断题答案' }) @IsOptional() selectedKeys?: unknown;
  @ApiProperty({ required: false, description: '简答题答案' }) @IsOptional() @IsString() textAnswer?: string;
}

export class SubmitExamAttemptDto {
  @ApiProperty() @IsString() examId: string;

  @ApiProperty({ type: [ExamAnswerInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ExamAnswerInputDto)
  answers: ExamAnswerInputDto[];
}
