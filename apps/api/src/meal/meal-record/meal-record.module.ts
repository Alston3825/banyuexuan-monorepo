import { Module } from '@nestjs/common';
import { MealRecordController } from './meal-record.controller';
import { MealRecordService } from './meal-record.service';

@Module({
  controllers: [MealRecordController],
  providers: [MealRecordService],
  exports: [MealRecordService],
})
export class MealRecordModule {}
