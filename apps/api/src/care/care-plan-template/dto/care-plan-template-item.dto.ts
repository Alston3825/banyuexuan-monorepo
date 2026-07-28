import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Min } from 'class-validator';

export class CarePlanTemplateItemDto {
  @ApiProperty({ description: '入住第几天，从1开始' }) @IsInt() @Min(1) dayOffset: number;
  @ApiProperty() @IsString() formTemplateId: string;
}
