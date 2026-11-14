import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsInt, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class GradeAnswerInputDto {
  @ApiProperty() @IsString() answerId: string;
  @ApiProperty({ description: '该题（简答题）人工给分' }) @IsInt() @Min(0) score: number;
}

export class GradeExamAttemptDto {
  @ApiProperty({ type: [GradeAnswerInputDto], description: '仅需提供简答题的批阅得分' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GradeAnswerInputDto)
  answers: GradeAnswerInputDto[];
}
