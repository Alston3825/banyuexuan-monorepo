import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CareOutreachTemplateItemDto {
  @ApiProperty({ description: '离店日之后第几天，0=离店当天' }) @IsInt() @Min(0) dayOffset: number;
  @ApiProperty() @IsString() title: string;
  @ApiProperty({ required: false, description: '提醒要点/话术，自由文本，由用户/护理团队自行填写' })
  @IsOptional()
  @IsString()
  content?: string;
}
