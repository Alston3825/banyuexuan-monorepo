import { Module } from '@nestjs/common';
import { MotherProfileController } from './mother-profile.controller';
import { MotherProfileService } from './mother-profile.service';
import { CareArchiveModule } from '../care-archive.module';
import { CustomerModule } from '../../crm/customer/customer.module';

import { RecycleBinModule } from '../../common/recycle/recycle-bin.module';

@Module({
  imports: [RecycleBinModule, CustomerModule, CareArchiveModule],
  controllers: [MotherProfileController],
  providers: [MotherProfileService],
  exports: [MotherProfileService],
})
export class MotherProfileModule {}
