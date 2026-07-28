import { Module } from '@nestjs/common';
import { BabyProfileController } from './baby-profile.controller';
import { BabyProfileService } from './baby-profile.service';

@Module({
  controllers: [BabyProfileController],
  providers: [BabyProfileService],
  exports: [BabyProfileService],
})
export class BabyProfileModule {}
