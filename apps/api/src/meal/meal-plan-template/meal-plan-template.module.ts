import { Module } from '@nestjs/common';
import { MealPlanTemplateController } from './meal-plan-template.controller';
import { MealPlanTemplateService } from './meal-plan-template.service';

@Module({
  controllers: [MealPlanTemplateController],
  providers: [MealPlanTemplateService],
  exports: [MealPlanTemplateService],
})
export class MealPlanTemplateModule {}
