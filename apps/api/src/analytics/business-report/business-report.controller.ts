import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { BusinessReportService } from './business-report.service';
import { QueryBusinessReportDto } from './dto/query-business-report.dto';

@ApiTags('analytics/business-report')
@Controller('analytics')
export class BusinessReportController {
  constructor(private readonly businessReportService: BusinessReportService) {}

  @Get('finance-summary')
  @RequirePermission('analytics.dashboard.view')
  getFinanceSummary(@Query() query: QueryBusinessReportDto) {
    return this.businessReportService.getFinanceSummary(query);
  }

  @Get('occupancy-summary')
  @RequirePermission('analytics.dashboard.view')
  getOccupancySummary(@Query() query: QueryBusinessReportDto) {
    return this.businessReportService.getOccupancySummary(query);
  }
}
