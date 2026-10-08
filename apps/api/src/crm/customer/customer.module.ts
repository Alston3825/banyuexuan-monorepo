import { Module } from '@nestjs/common';
import { CareArchiveModule } from '../../care/care-archive.module';
import { TagModule } from '../../platform/tag/tag.module';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';

@Module({
  imports: [TagModule, CareArchiveModule],
  controllers: [CustomerController],
  providers: [CustomerService],
  exports: [CustomerService],
})
export class CustomerModule {}
