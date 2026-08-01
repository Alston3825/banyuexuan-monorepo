import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsString } from 'class-validator';

export class CreateCareOutreachPlanDto {
  @ApiProperty() @IsString() motherProfileId: string;
  @ApiProperty() @IsString() templateId: string;
  @ApiProperty({ description: '离店日期，节点日期=此日期+dayOffset天' }) @IsDateString() checkedOutAt: string;
}
