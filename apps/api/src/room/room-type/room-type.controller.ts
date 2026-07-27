import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { RoomTypeService } from './room-type.service';
import { CreateRoomTypeDto } from './dto/create-room-type.dto';
import { UpdateRoomTypeDto } from './dto/update-room-type.dto';

@ApiTags('room/type')
@Controller('room/types')
export class RoomTypeController {
  constructor(private readonly roomTypeService: RoomTypeService) {}

  @Get()
  @RequirePermission('room.type.view')
  findAll() {
    return this.roomTypeService.findMany();
  }

  @Get(':id')
  @RequirePermission('room.type.view')
  findOne(@Param('id') id: string) {
    return this.roomTypeService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('room.type.create')
  create(@Body() dto: CreateRoomTypeDto) {
    return this.roomTypeService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('room.type.update')
  update(@Param('id') id: string, @Body() dto: UpdateRoomTypeDto) {
    const { version, ...data } = dto;
    return this.roomTypeService.update(id, data, version);
  }
}
