import { Module } from '@nestjs/common';
import { RoomOccupancyController } from './room-occupancy.controller';
import { RoomOccupancyService } from './room-occupancy.service';
import { IntegrationModule } from '../../integration/integration.module';
import { CustomerModule } from '../../crm/customer/customer.module';

@Module({
  imports: [CustomerModule, IntegrationModule],
  controllers: [RoomOccupancyController],
  providers: [RoomOccupancyService],
  exports: [RoomOccupancyService],
})
export class RoomOccupancyModule {}
