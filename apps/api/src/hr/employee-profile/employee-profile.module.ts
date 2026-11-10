import { Module } from '@nestjs/common';
import { IntegrationModule } from '../../integration/integration.module';
import { EmployeeProfileController } from './employee-profile.controller';
import { EmployeeProfileService } from './employee-profile.service';

@Module({
  imports: [IntegrationModule],
  controllers: [EmployeeProfileController],
  providers: [EmployeeProfileService],
  exports: [EmployeeProfileService],
})
export class EmployeeProfileModule {}
