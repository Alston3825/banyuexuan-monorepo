import { Module } from '@nestjs/common';
import { MotherProfileController } from './mother-profile.controller';
import { MotherProfileService } from './mother-profile.service';
import { CustomerModule } from '../../crm/customer/customer.module';

@Module({
  imports: [CustomerModule],
  controllers: [MotherProfileController],
  providers: [MotherProfileService],
  exports: [MotherProfileService],
})
export class MotherProfileModule {}
