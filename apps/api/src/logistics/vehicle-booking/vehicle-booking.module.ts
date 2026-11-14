import { Module } from '@nestjs/common';
import { VehicleBookingController } from './vehicle-booking.controller';
import { VehicleBookingService } from './vehicle-booking.service';

@Module({
  controllers: [VehicleBookingController],
  providers: [VehicleBookingService],
  exports: [VehicleBookingService],
})
export class VehicleBookingModule {}
