import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ExamQuestionDto } from './exam-question.dto';

export class CreateTrainingExamDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty({ required: false, description: '学习资料，自由文本' }) @IsOptional() @IsString() studyMaterial?: string;
  @ApiProperty({ required: false, description: '及格分数线' }) @IsOptional() @IsInt() @Min(0) passScore?: number;

  @ApiProperty({ type: [ExamQuestionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ExamQuestionDto)
  questions: ExamQuestionDto[];
}
