import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { VehicleBookingService } from './vehicle-booking.service';
import { CreateVehicleBookingDto } from './dto/create-vehicle-booking.dto';
import { QueryVehicleBookingDto } from './dto/query-vehicle-booking.dto';
import { CancelVehicleBookingDto } from './dto/cancel-vehicle-booking.dto';

@ApiTags('logistics/vehicle-booking')
@Controller('logistics/vehicle-bookings')
export class VehicleBookingController {
  constructor(private readonly vehicleBookingService: VehicleBookingService) {}

  @Get()
  @RequirePermission('logistics.vehicle-booking.view')
  findAll(@Query() query: QueryVehicleBookingDto) {
    return this.vehicleBookingService.findMany(query);
  }

  @Get(':id')
  @RequirePermission('logistics.vehicle-booking.view')
  findOne(@Param('id') id: string) {
    return this.vehicleBookingService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('logistics.vehicle-booking.create')
  create(@Body() dto: CreateVehicleBookingDto) {
    return this.vehicleBookingService.create(dto);
  }

  @Post(':id/cancel')
  @RequirePermission('logistics.vehicle-booking.cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelVehicleBookingDto) {
    return this.vehicleBookingService.cancel(id, dto.cancelReason, dto.version);
  }
}
