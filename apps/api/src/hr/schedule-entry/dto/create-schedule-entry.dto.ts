import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateScheduleEntryDto {
  @ApiProperty() @IsString() storeId: string;
  @ApiProperty() @IsString() employeeProfileId: string;
  @ApiProperty() @IsDateString() workDate: string;
  @ApiProperty() @IsString() shiftDefinitionId: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() remark?: string;
}
