import { Module } from '@nestjs/common';
import { MealItemController } from './meal-item.controller';
import { MealItemService } from './meal-item.service';

@Module({
  controllers: [MealItemController],
  providers: [MealItemService],
  exports: [MealItemService],
})
export class MealItemModule {}
