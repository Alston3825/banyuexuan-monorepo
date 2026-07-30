import { Module } from '@nestjs/common';
import { DeviceTypeModule } from './device-type/device-type.module';
import { DeviceModule } from './device/device.module';
import { DeviceGatewayModule } from './device-gateway/device-gateway.module';

@Module({
  imports: [DeviceTypeModule, DeviceModule, DeviceGatewayModule],
})
export class IotModule {}
