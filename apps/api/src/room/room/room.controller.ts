import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { RoomService } from './room.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { QueryRoomDto } from './dto/query-room.dto';
import { QueryRoomBoardDto } from './dto/query-room-board.dto';
import { MaintenanceRoomDto } from './dto/maintenance-room.dto';
import { CleanRoomDto } from './dto/clean-room.dto';

@ApiTags('room/room')
@Controller('room/rooms')
export class RoomController {
  constructor(private readonly roomService: RoomService) {}

  @Get('board')
  @RequirePermission('room.room.view')
  getBoard(@Query() query: QueryRoomBoardDto) {
    return this.roomService.getBoard(query);
  }

  @Get()
  @RequirePermission('room.room.view')
  findAll(@Query() query: QueryRoomDto) {
    return this.roomService.findMany(query);
  }

  @Get(':id/delete-check')
  @RequirePermission('room.room.delete')
  deleteCheck(@Param('id') id: string) {
    return this.roomService.getDeleteCheck(id);
  }

  @Get(':id')
  @RequirePermission('room.room.view')
  findOne(@Param('id') id: string) {
    return this.roomService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('room.room.create')
  create(@Body() dto: CreateRoomDto) {
    return this.roomService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('room.room.update')
  update(@Param('id') id: string, @Body() dto: UpdateRoomDto) {
    const { version, ...data } = dto;
    return this.roomService.update(id, data, version);
  }

  @Patch(':id/maintenance')
  @RequirePermission('room.room.maintenance')
  setMaintenance(@Param('id') id: string, @Body() dto: MaintenanceRoomDto) {
    return this.roomService.setMaintenance(id, dto.underMaintenance, dto.note, dto.version);
  }

  @Patch(':id/clean')
  @RequirePermission('room.room.clean')
  markCleaned(@Param('id') id: string, @Body() dto: CleanRoomDto) {
    return this.roomService.markCleaned(id, dto.version);
  }

  @Delete(':id')
  @RequirePermission('room.room.delete')
  async remove(@Param('id') id: string, @Query('confirmRoomNo') confirmRoomNo?: string) {
    await this.roomService.remove(id, confirmRoomNo);
    return { success: true };
  }
}
