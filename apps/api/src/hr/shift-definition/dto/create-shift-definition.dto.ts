import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateShiftDefinitionDto {
  @ApiProperty() @IsString() storeId: string;
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ description: '格式 HH:mm' }) @IsString() startTime: string;
  @ApiProperty({ description: '格式 HH:mm，跨零点班次(如夜班)可小于startTime' }) @IsString() endTime: string;
}
