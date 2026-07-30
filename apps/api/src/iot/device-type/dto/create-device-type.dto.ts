import { ApiProperty } from '@nestjs/swagger';
import { DeviceCategory } from '@prisma/client';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateDeviceTypeDto {
  @ApiProperty({ enum: DeviceCategory }) @IsEnum(DeviceCategory) category: DeviceCategory;
  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiProperty({ description: '接入协议，自由文本，如 "MQTT"/"RTSP/MQTT"/"串口转HTTP"' }) @IsString() @IsNotEmpty() protocol: string;
  @ApiProperty({ required: false, description: '门禁/监控等敏感设备下发指令是否需要二次确认' })
  @IsOptional()
  @IsBoolean()
  requiresCommandConfirmation?: boolean;
}
