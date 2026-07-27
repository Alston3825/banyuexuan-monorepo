import { Module } from '@nestjs/common';
import { RoomTypeModule } from './room-type/room-type.module';
import { RoomEntityModule } from './room/room.module';
import { RoomOccupancyModule } from './room-occupancy/room-occupancy.module';

@Module({
  imports: [RoomTypeModule, RoomEntityModule, RoomOccupancyModule],
})
export class RoomModule {}
