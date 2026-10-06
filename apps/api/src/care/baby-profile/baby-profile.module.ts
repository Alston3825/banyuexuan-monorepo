import { Module } from '@nestjs/common';
import { CareArchiveModule } from '../care-archive.module';
import { BabyProfileController } from './baby-profile.controller';
import { BabyProfileService } from './baby-profile.service';

@Module({
  imports: [CareArchiveModule],
  controllers: [BabyProfileController],
  providers: [BabyProfileService],
  exports: [BabyProfileService],
})
export class BabyProfileModule {}
