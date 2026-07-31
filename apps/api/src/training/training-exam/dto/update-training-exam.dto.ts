import { ApiProperty } from '@nestjs/swagger';
import { TrainingExamStatus } from '@prisma/client';
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ExamQuestionDto } from './exam-question.dto';

export class UpdateTrainingExamDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() title?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() studyMaterial?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(0) passScore?: number;
  @ApiProperty({ required: false, enum: TrainingExamStatus }) @IsOptional() @IsEnum(TrainingExamStatus) status?: TrainingExamStatus;

  @ApiProperty({ type: [ExamQuestionDto], required: false, description: '若提供则整体替换题目列表' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ExamQuestionDto)
  questions?: ExamQuestionDto[];

  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
