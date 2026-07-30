import { Module } from '@nestjs/common';
import { DeviceTypeController } from './device-type.controller';
import { DeviceTypeService } from './device-type.service';

@Module({
  controllers: [DeviceTypeController],
  providers: [DeviceTypeService],
  exports: [DeviceTypeService],
})
export class DeviceTypeModule {}
