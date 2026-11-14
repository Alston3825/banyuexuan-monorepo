import { Module } from '@nestjs/common';
import { RoomCallModule } from '../../room/room-call/room-call.module';
import { UtilityExpenseModule } from '../../logistics/utility-expense/utility-expense.module';
import { DeviceGatewayController } from './device-gateway.controller';
import { DeviceGatewayService } from './device-gateway.service';

@Module({
  imports: [RoomCallModule, UtilityExpenseModule],
  controllers: [DeviceGatewayController],
  providers: [DeviceGatewayService],
  exports: [DeviceGatewayService],
})
export class DeviceGatewayModule {}
