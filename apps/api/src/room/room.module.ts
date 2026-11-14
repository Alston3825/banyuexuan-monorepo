import { Module } from '@nestjs/common';
import { RoomTypeModule } from './room-type/room-type.module';
import { RoomEntityModule } from './room/room.module';
import { RoomOccupancyModule } from './room-occupancy/room-occupancy.module';
import { RoomCallModule } from './room-call/room-call.module';
import { RoomOutingModule } from './room-outing/room-outing.module';
import { RoomServiceRequisitionModule } from './room-service-requisition/room-service-requisition.module';

@Module({
  imports: [RoomTypeModule, RoomEntityModule, RoomOccupancyModule, RoomCallModule, RoomOutingModule, RoomServiceRequisitionModule],
})
export class RoomModule {}
