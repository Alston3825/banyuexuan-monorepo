import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { DeviceService } from './device.service';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { QueryDeviceDto } from './dto/query-device.dto';

@ApiTags('iot/device')
@Controller('iot/devices')
export class DeviceController {
  constructor(private readonly deviceService: DeviceService) {}

  @Get()
  @RequirePermission('iot.device-registry.view')
  findAll(@Query() query: QueryDeviceDto) {
    return this.deviceService.findMany(query);
  }

  @Get(':id')
  @RequirePermission('iot.device-registry.view')
  findOne(@Param('id') id: string) {
    return this.deviceService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('iot.device-registry.create')
  create(@Body() dto: CreateDeviceDto) {
    return this.deviceService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('iot.device-registry.update')
  update(@Param('id') id: string, @Body() dto: UpdateDeviceDto) {
    const { version, ...data } = dto;
    return this.deviceService.update(id, data, version);
  }
}
