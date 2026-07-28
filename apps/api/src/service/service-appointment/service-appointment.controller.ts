import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ServiceAppointmentService } from './service-appointment.service';
import { CreateServiceAppointmentDto } from './dto/create-service-appointment.dto';
import { QueryServiceAppointmentDto } from './dto/query-service-appointment.dto';
import { CancelServiceAppointmentDto } from './dto/cancel-service-appointment.dto';
import { FeedbackServiceAppointmentDto } from './dto/feedback-service-appointment.dto';
import { VersionDto } from './dto/version.dto';

@ApiTags('service/appointment')
@Controller('service/appointments')
export class ServiceAppointmentController {
  constructor(private readonly serviceAppointmentService: ServiceAppointmentService) {}

  @Get()
  @RequirePermission('service.appointment.view')
  findAll(@Query() query: QueryServiceAppointmentDto) {
    return this.serviceAppointmentService.findMany(query);
  }

  @Get(':id')
  @RequirePermission('service.appointment.view')
  findOne(@Param('id') id: string) {
    return this.serviceAppointmentService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('service.appointment.create')
  create(@Body() dto: CreateServiceAppointmentDto) {
    return this.serviceAppointmentService.create(dto);
  }

  @Post(':id/complete')
  @RequirePermission('service.appointment.complete')
  complete(@Param('id') id: string, @Body() dto: VersionDto) {
    return this.serviceAppointmentService.complete(id, dto.version);
  }

  @Post(':id/cancel')
  @RequirePermission('service.appointment.cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelServiceAppointmentDto) {
    return this.serviceAppointmentService.cancel(id, dto);
  }

  @Post(':id/feedback')
  @RequirePermission('service.appointment.feedback')
  feedback(@Param('id') id: string, @Body() dto: FeedbackServiceAppointmentDto) {
    return this.serviceAppointmentService.feedback(id, dto);
  }
}
