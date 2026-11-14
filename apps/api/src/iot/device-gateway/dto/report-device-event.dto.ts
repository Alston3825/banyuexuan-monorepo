import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class ReportDeviceEventDto {
  @ApiProperty() @IsString() @IsNotEmpty() deviceId: string;
  @ApiProperty({ description: '如 CALL_TRIGGER / METER_READING，自由文本，由模拟面板或未来真实网关填写' })
  @IsString()
  @IsNotEmpty()
  eventType: string;
  @ApiProperty({
    description:
      '事件载荷，按设备类别决定字段：呼叫类需 roomId(+可选reason)；能耗计量类需 expenseType+amount(分)(+可选period，默认当月)；其余类别自由内容仅留痕',
  })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
