import { ApiProperty } from '@nestjs/swagger';
import { LeaveType } from '@prisma/client';
import { IsEnum, IsISO8601, IsNotEmpty, IsString } from 'class-validator';

export class CreateLeaveRequestDto {
  @ApiProperty() @IsString() storeId: string;
  @ApiProperty() @IsString() employeeProfileId: string;
  @ApiProperty({ enum: LeaveType }) @IsEnum(LeaveType) leaveType: LeaveType;
  @ApiProperty() @IsISO8601() startDate: string;
  @ApiProperty() @IsISO8601() endDate: string;
  @ApiProperty() @IsString() @IsNotEmpty() reason: string;
}
