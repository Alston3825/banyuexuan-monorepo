import { Module } from '@nestjs/common';
import { CareOutreachPlanController } from './care-outreach-plan.controller';
import { CareOutreachPlanService } from './care-outreach-plan.service';

@Module({
  controllers: [CareOutreachPlanController],
  providers: [CareOutreachPlanService],
  exports: [CareOutreachPlanService],
})
export class CareOutreachPlanModule {}
