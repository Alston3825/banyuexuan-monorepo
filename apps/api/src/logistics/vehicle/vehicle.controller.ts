import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { VehicleService } from './vehicle.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';

@ApiTags('logistics/vehicle')
@Controller('logistics/vehicles')
export class VehicleController {
  constructor(private readonly vehicleService: VehicleService) {}

  @Get()
  @RequirePermission('logistics.vehicle.view')
  findAll() {
    return this.vehicleService.findMany();
  }

  @Get(':id')
  @RequirePermission('logistics.vehicle.view')
  findOne(@Param('id') id: string) {
    return this.vehicleService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('logistics.vehicle.create')
  create(@Body() dto: CreateVehicleDto) {
    return this.vehicleService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('logistics.vehicle.update')
  update(@Param('id') id: string, @Body() dto: UpdateVehicleDto) {
    const { version, ...data } = dto;
    return this.vehicleService.update(id, data, version);
  }
}
