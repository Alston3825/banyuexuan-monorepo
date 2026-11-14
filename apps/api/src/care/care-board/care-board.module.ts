import { Module } from '@nestjs/common';
import { CareBoardController } from './care-board.controller';
import { CareBoardService } from './care-board.service';
import { RoomEntityModule } from '../../room/room/room.module';

@Module({
  imports: [RoomEntityModule],
  controllers: [CareBoardController],
  providers: [CareBoardService],
})
export class CareBoardModule {}
