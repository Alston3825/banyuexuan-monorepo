import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { RoomCallService } from './room-call.service';
import { CreateRoomCallDto } from './dto/create-room-call.dto';
import { QueryRoomCallDto } from './dto/query-room-call.dto';

@ApiTags('room/call')
@Controller('room/calls')
export class RoomCallController {
  constructor(private readonly roomCallService: RoomCallService) {}

  @Get()
  @RequirePermission('room.call.view')
  findAll(@Query() query: QueryRoomCallDto) {
    return this.roomCallService.findMany(query);
  }

  @Post()
  @RequirePermission('room.call.create')
  create(@Body() dto: CreateRoomCallDto) {
    return this.roomCallService.create(dto);
  }

  @Post(':id/handle')
  @RequirePermission('room.call.handle')
  handle(@Param('id') id: string) {
    return this.roomCallService.handle(id);
  }
}
