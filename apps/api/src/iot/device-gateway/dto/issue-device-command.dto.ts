import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsNotEmpty } from 'class-validator';

export class IssueDeviceCommandDto {
  @ApiProperty({ description: '写入 Device Shadow 的期望态(desired)，等待设备端确认后同步为上报态(reported)' })
  @IsObject()
  @IsNotEmpty()
  desiredState: Record<string, unknown>;
}
