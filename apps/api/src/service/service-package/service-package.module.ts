import { Module } from '@nestjs/common';
import { ServicePackageController } from './service-package.controller';
import { ServicePackageService } from './service-package.service';

@Module({
  controllers: [ServicePackageController],
  providers: [ServicePackageService],
  exports: [ServicePackageService],
})
export class ServicePackageModule {}
