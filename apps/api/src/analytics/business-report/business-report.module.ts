import { Module } from '@nestjs/common';
import { BusinessReportController } from './business-report.controller';
import { BusinessReportService } from './business-report.service';

@Module({
  controllers: [BusinessReportController],
  providers: [BusinessReportService],
  exports: [BusinessReportService],
})
export class BusinessReportModule {}
