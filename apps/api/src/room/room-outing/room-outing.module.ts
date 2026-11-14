import { Module } from '@nestjs/common';
import { RoomOutingController } from './room-outing.controller';
import { RoomOutingService } from './room-outing.service';

@Module({
  controllers: [RoomOutingController],
  providers: [RoomOutingService],
  exports: [RoomOutingService],
})
export class RoomOutingModule {}
