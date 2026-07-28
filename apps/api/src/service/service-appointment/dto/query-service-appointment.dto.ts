import { ApiProperty } from '@nestjs/swagger';
import { ServiceAppointmentStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class QueryServiceAppointmentDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() customerId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() therapistId?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() storeId?: string;
  @ApiProperty({ required: false, enum: ServiceAppointmentStatus })
  @IsOptional()
  @IsEnum(ServiceAppointmentStatus)
  status?: ServiceAppointmentStatus;
}
