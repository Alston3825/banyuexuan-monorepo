import { Module } from '@nestjs/common';
import { CareAbnormalityController } from './care-abnormality.controller';
import { CareAbnormalityService } from './care-abnormality.service';
import { FollowUpModule } from '../../crm/follow-up/follow-up.module';

@Module({
  imports: [FollowUpModule],
  controllers: [CareAbnormalityController],
  providers: [CareAbnormalityService],
  exports: [CareAbnormalityService],
})
export class CareAbnormalityModule {}
