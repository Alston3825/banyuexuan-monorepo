import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { RoomServiceRequisitionService } from './room-service-requisition.service';
import { CreateRoomServiceRequisitionDto } from './dto/create-room-service-requisition.dto';
import { QueryRoomServiceRequisitionDto } from './dto/query-room-service-requisition.dto';

@ApiTags('room/service-requisition')
@Controller('room/service-requisitions')
export class RoomServiceRequisitionController {
  constructor(private readonly roomServiceRequisitionService: RoomServiceRequisitionService) {}

  @Get()
  @RequirePermission('room.service-requisition.view')
  findAll(@Query() query: QueryRoomServiceRequisitionDto) {
    return this.roomServiceRequisitionService.findMany(query);
  }

  @Post()
  @RequirePermission('room.service-requisition.create')
  create(@Body() dto: CreateRoomServiceRequisitionDto) {
    return this.roomServiceRequisitionService.create(dto);
  }

  @Post(':id/fulfill')
  @RequirePermission('room.service-requisition.fulfill')
  fulfill(@Param('id') id: string) {
    return this.roomServiceRequisitionService.fulfill(id);
  }
}
