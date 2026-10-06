import { Module } from '@nestjs/common';
import { CustomerChannelController } from './customer-channel.controller';
import { CustomerChannelService, CustomerChannelTypeService } from './customer-channel.service';

@Module({
  controllers: [CustomerChannelController],
  providers: [CustomerChannelService, CustomerChannelTypeService],
  exports: [CustomerChannelService, CustomerChannelTypeService],
})
export class CustomerChannelModule {}
