import { Module } from '@nestjs/common';
import { MealItemModule } from './meal-item/meal-item.module';
import { DietaryRestrictionModule } from './dietary-restriction/dietary-restriction.module';
import { MealPlanTemplateModule } from './meal-plan-template/meal-plan-template.module';
import { DinerProfileModule } from './diner-profile/diner-profile.module';
import { MealRecordModule } from './meal-record/meal-record.module';

@Module({
  imports: [MealItemModule, DietaryRestrictionModule, MealPlanTemplateModule, DinerProfileModule, MealRecordModule],
})
export class MealModule {}
