import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { RoomOccupancyService } from './room-occupancy.service';
import { CreateRoomOccupancyDto } from './dto/create-room-occupancy.dto';
import { QueryRoomOccupancyDto } from './dto/query-room-occupancy.dto';
import { CheckInRoomOccupancyDto } from './dto/check-in-room-occupancy.dto';
import { CheckOutRoomOccupancyDto } from './dto/check-out-room-occupancy.dto';
import { CancelRoomOccupancyDto } from './dto/cancel-room-occupancy.dto';

@ApiTags('room/occupancy')
@Controller('room/occupancies')
export class RoomOccupancyController {
  constructor(private readonly roomOccupancyService: RoomOccupancyService) {}

  @Get()
  @RequirePermission('room.occupancy.view')
  findAll(@Query() query: QueryRoomOccupancyDto) {
    return this.roomOccupancyService.findMany(query);
  }

  @Get(':id')
  @RequirePermission('room.occupancy.view')
  findOne(@Param('id') id: string) {
    return this.roomOccupancyService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('room.occupancy.create')
  create(@Body() dto: CreateRoomOccupancyDto) {
    return this.roomOccupancyService.create(dto);
  }

  @Post(':id/check-in')
  @RequirePermission('room.occupancy.checkin')
  checkIn(@Param('id') id: string, @Body() dto: CheckInRoomOccupancyDto) {
    return this.roomOccupancyService.checkIn(id, dto.version);
  }

  @Post(':id/check-out')
  @RequirePermission('room.occupancy.checkout')
  checkOut(@Param('id') id: string, @Body() dto: CheckOutRoomOccupancyDto) {
    return this.roomOccupancyService.checkOut(id, dto.version);
  }

  @Post(':id/cancel')
  @RequirePermission('room.occupancy.cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelRoomOccupancyDto) {
    return this.roomOccupancyService.cancel(id, dto.cancelReason, dto.version);
  }
}
