import { Module } from '@nestjs/common';
import { CareArchiveModule } from '../../care/care-archive.module';
import { TagModule } from '../../platform/tag/tag.module';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';

import { RecycleBinModule } from '../../common/recycle/recycle-bin.module';

@Module({
  imports: [RecycleBinModule, TagModule, CareArchiveModule],
  controllers: [CustomerController],
  providers: [CustomerService],
  exports: [CustomerService],
})
export class CustomerModule {}
