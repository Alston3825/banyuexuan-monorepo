import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { DeviceTypeService } from './device-type.service';
import { CreateDeviceTypeDto } from './dto/create-device-type.dto';
import { UpdateDeviceTypeDto } from './dto/update-device-type.dto';

@ApiTags('iot/device-type')
@Controller('iot/device-types')
export class DeviceTypeController {
  constructor(private readonly deviceTypeService: DeviceTypeService) {}

  @Get()
  @RequirePermission('iot.device-type.view')
  findAll() {
    return this.deviceTypeService.findMany();
  }

  @Get(':id')
  @RequirePermission('iot.device-type.view')
  findOne(@Param('id') id: string) {
    return this.deviceTypeService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('iot.device-type.create')
  create(@Body() dto: CreateDeviceTypeDto) {
    return this.deviceTypeService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('iot.device-type.update')
  update(@Param('id') id: string, @Body() dto: UpdateDeviceTypeDto) {
    const { version, ...data } = dto;
    return this.deviceTypeService.update(id, data, version);
  }
}
