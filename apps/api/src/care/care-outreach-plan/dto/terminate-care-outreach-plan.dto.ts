import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString } from 'class-validator';

export class TerminateCareOutreachPlanDto {
  @ApiProperty() @IsString() @IsNotEmpty() reason: string;
  @ApiProperty({ description: '乐观锁版本号' }) @IsInt() version: number;
}
