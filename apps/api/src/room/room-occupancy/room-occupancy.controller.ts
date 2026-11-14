import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { IsInt, IsString } from 'class-validator';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { RoomOccupancyService } from './room-occupancy.service';
import { CreateRoomOccupancyDto } from './dto/create-room-occupancy.dto';
import { QueryRoomOccupancyDto } from './dto/query-room-occupancy.dto';
import { CheckInRoomOccupancyDto } from './dto/check-in-room-occupancy.dto';
import { CheckOutRoomOccupancyDto } from './dto/check-out-room-occupancy.dto';
import { CancelRoomOccupancyDto } from './dto/cancel-room-occupancy.dto';
import { RescheduleRoomOccupancyDto } from './dto/reschedule-room-occupancy.dto';

class ChangeRoomDto {
  @IsString() roomId: string;
  @IsInt() version: number;
}

@ApiTags('room/occupancy')
@Controller('room/occupancies')
export class RoomOccupancyController {
  constructor(private readonly roomOccupancyService: RoomOccupancyService) {}

  @Get()
  @RequirePermission('room.occupancy.view')
  findAll(@Query() query: QueryRoomOccupancyDto) {
    return this.roomOccupancyService.findMany(query);
  }

  /** 预订冲突清单：同一间房日期重叠或间隔不足整理时间的两两组合 */
  @Get('conflicts')
  @RequirePermission('room.occupancy.view')
  conflicts(@Query('storeId') storeId?: string) {
    return this.roomOccupancyService.findConflicts(storeId);
  }

  /** 这条预订能换到的空房（同房型排前面） */
  @Get(':id/free-rooms')
  @RequirePermission('room.occupancy.view')
  freeRooms(@Param('id') id: string) {
    return this.roomOccupancyService.freeRooms(id);
  }

  /** 办理入住时可选的房间（含每间房当前状态，同一门店） */
  @Get(':id/checkin-rooms')
  @RequirePermission('room.occupancy.view')
  checkInRooms(@Param('id') id: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.roomOccupancyService.checkInRooms(id, from, to);
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
    return this.roomOccupancyService.checkIn(id, dto);
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

  @Post(':id/change-room')
  @RequirePermission('room.occupancy.reschedule')
  changeRoom(@Param('id') id: string, @Body() dto: ChangeRoomDto) {
    return this.roomOccupancyService.changeRoom(id, dto.roomId, dto.version);
  }

  @Patch(':id/reschedule')
  @RequirePermission('room.occupancy.reschedule')
  reschedule(@Param('id') id: string, @Body() dto: RescheduleRoomOccupancyDto) {
    return this.roomOccupancyService.reschedule(id, dto);
  }
}
