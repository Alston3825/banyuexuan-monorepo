import { Module } from '@nestjs/common';
import { CustomerServicePackageController } from './customer-service-package.controller';
import { CustomerServicePackageService } from './customer-service-package.service';

@Module({
  controllers: [CustomerServicePackageController],
  providers: [CustomerServicePackageService],
  exports: [CustomerServicePackageService],
})
export class CustomerServicePackageModule {}
