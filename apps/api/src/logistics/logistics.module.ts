import { Module } from '@nestjs/common';
import { VehicleModule } from './vehicle/vehicle.module';
import { VehicleBookingModule } from './vehicle-booking/vehicle-booking.module';
import { UtilityExpenseModule } from './utility-expense/utility-expense.module';

@Module({
  imports: [VehicleModule, VehicleBookingModule, UtilityExpenseModule],
})
export class LogisticsModule {}
