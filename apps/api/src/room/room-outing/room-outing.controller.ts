import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { RoomOutingService } from './room-outing.service';
import { CreateRoomOutingDto } from './dto/create-room-outing.dto';
import { QueryRoomOutingDto } from './dto/query-room-outing.dto';
import { VersionDto } from './dto/version.dto';
import { CancelRoomOutingDto } from './dto/cancel-room-outing.dto';

@ApiTags('room/outing')
@Controller('room/outings')
export class RoomOutingController {
  constructor(private readonly roomOutingService: RoomOutingService) {}

  @Get()
  @RequirePermission('room.outing.view')
  findAll(@Query() query: QueryRoomOutingDto) {
    return this.roomOutingService.findMany(query);
  }

  @Post()
  @RequirePermission('room.outing.create')
  create(@Body() dto: CreateRoomOutingDto) {
    return this.roomOutingService.create(dto);
  }

  @Post(':id/check-out')
  @RequirePermission('room.outing.checkout')
  checkOut(@Param('id') id: string, @Body() dto: VersionDto) {
    return this.roomOutingService.checkOut(id, dto.version);
  }

  @Post(':id/check-back')
  @RequirePermission('room.outing.checkback')
  checkBack(@Param('id') id: string, @Body() dto: VersionDto) {
    return this.roomOutingService.checkBack(id, dto.version);
  }

  @Post(':id/cancel')
  @RequirePermission('room.outing.cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelRoomOutingDto) {
    return this.roomOutingService.cancel(id, dto.cancelReason, dto.version);
  }
}
