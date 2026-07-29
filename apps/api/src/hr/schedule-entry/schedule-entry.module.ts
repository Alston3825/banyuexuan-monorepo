import { Module } from '@nestjs/common';
import { ScheduleEntryController } from './schedule-entry.controller';
import { ScheduleEntryService } from './schedule-entry.service';

@Module({
  controllers: [ScheduleEntryController],
  providers: [ScheduleEntryService],
  exports: [ScheduleEntryService],
})
export class ScheduleEntryModule {}
