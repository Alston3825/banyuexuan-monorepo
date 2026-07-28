import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateServiceAppointmentDto {
  @ApiProperty() @IsString() storeId: string;
  @ApiProperty() @IsString() customerId: string;
  @ApiProperty() @IsString() productId: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() therapistId?: string;
  @ApiProperty({ required: false, description: '从该客户已购服务包扣减次数；不传则视为单次散卖' })
  @IsOptional()
  @IsString()
  sourcePackageId?: string;
  @ApiProperty() @IsDateString() scheduledAt: string;
  @ApiProperty() @IsInt() @Min(1) durationMinutes: number;
}
