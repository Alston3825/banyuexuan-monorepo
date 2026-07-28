import { Module } from '@nestjs/common';
import { CarePlanTemplateController } from './care-plan-template.controller';
import { CarePlanTemplateService } from './care-plan-template.service';

@Module({
  controllers: [CarePlanTemplateController],
  providers: [CarePlanTemplateService],
  exports: [CarePlanTemplateService],
})
export class CarePlanTemplateModule {}
