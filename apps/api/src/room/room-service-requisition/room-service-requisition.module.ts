import { Module } from '@nestjs/common';
import { RoomServiceRequisitionController } from './room-service-requisition.controller';
import { RoomServiceRequisitionService } from './room-service-requisition.service';

@Module({
  controllers: [RoomServiceRequisitionController],
  providers: [RoomServiceRequisitionService],
  exports: [RoomServiceRequisitionService],
})
export class RoomServiceRequisitionModule {}
