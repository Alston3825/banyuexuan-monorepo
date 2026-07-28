import { Module } from '@nestjs/common';
import { ServiceProductModule } from './service-product/service-product.module';
import { ServicePackageModule } from './service-package/service-package.module';
import { TherapistModule } from './therapist/therapist.module';
import { CustomerServicePackageModule } from './customer-service-package/customer-service-package.module';
import { ServiceAppointmentModule } from './service-appointment/service-appointment.module';

@Module({
  imports: [ServiceProductModule, ServicePackageModule, TherapistModule, CustomerServicePackageModule, ServiceAppointmentModule],
})
export class ServiceModule {}
