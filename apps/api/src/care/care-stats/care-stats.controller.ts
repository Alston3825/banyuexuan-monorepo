import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CareStatsService } from './care-stats.service';

@ApiTags('care/stats')
@Controller('care')
export class CareStatsController {
  constructor(private readonly service: CareStatsService) {}

  @Get('stats/metrics')
  @RequirePermission('care.profile.view')
  metrics() {
    return this.service.metrics();
  }

  /** 按指标 + 条件 + 日期范围筛选日常护理记录里的数据，如“黄疸值 ≥ 12”。 */
  @Get('stats/query')
  @RequirePermission('care.profile.view')
  query(@Query('metric') metric: string, @Query('op') op: string, @Query('value') value: string, @Query('from') from?: string, @Query('to') to?: string, @Query('storeId') storeId?: string) {
    return this.service.query({ metric, op, value, from, to, storeId });
  }

  /** 出所护理小结。 */
  @Get('summary/:motherProfileId')
  @RequirePermission('care.profile.view')
  summary(@Param('motherProfileId') motherProfileId: string) {
    return this.service.summary(motherProfileId);
  }
}
