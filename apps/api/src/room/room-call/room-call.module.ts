import { Module } from '@nestjs/common';
import { RoomCallController } from './room-call.controller';
import { RoomCallService } from './room-call.service';

@Module({
  controllers: [RoomCallController],
  providers: [RoomCallService],
  exports: [RoomCallService],
})
export class RoomCallModule {}
