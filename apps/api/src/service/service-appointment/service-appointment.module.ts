import { Module } from '@nestjs/common';
import { ServiceAppointmentController } from './service-appointment.controller';
import { ServiceAppointmentService } from './service-appointment.service';

@Module({
  controllers: [ServiceAppointmentController],
  providers: [ServiceAppointmentService],
  exports: [ServiceAppointmentService],
})
export class ServiceAppointmentModule {}
