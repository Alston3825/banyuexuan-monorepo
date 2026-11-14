import { Module } from '@nestjs/common';
import { BusinessReportModule } from './business-report/business-report.module';

@Module({
  imports: [BusinessReportModule],
  exports: [BusinessReportModule],
})
export class AnalyticsModule {}
