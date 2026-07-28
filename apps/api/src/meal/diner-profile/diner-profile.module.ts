import { Module } from '@nestjs/common';
import { DinerProfileController } from './diner-profile.controller';
import { DinerProfileService } from './diner-profile.service';

@Module({
  controllers: [DinerProfileController],
  providers: [DinerProfileService],
  exports: [DinerProfileService],
})
export class DinerProfileModule {}
