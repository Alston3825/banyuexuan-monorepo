import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CancelServiceAppointmentDto {
  @ApiProperty() @IsString() @IsNotEmpty() cancelReason: string;
  @ApiProperty({ required: false, description: 'true=客户爽约（NO_SHOW），false/不传=正常取消（CANCELLED）' })
  @IsOptional()
  @IsBoolean()
  noShow?: boolean;

  @ApiProperty({ description: '乐观锁版本号' })
  @IsInt()
  version: number;
}
