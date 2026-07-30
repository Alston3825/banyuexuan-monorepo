import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { BusinessAnalyticsAgentService } from './business-analytics-agent.service';
import { AnalyzeBusinessDto } from './dto/analyze-business.dto';

@ApiTags('ai/business-analytics-agent')
@Controller('ai/business-analytics-agent')
export class BusinessAnalyticsAgentController {
  constructor(private readonly businessAnalyticsAgentService: BusinessAnalyticsAgentService) {}

  @Post('analyze')
  @RequirePermission('ai.business-analytics-agent.analyze')
  analyze(@Body() dto: AnalyzeBusinessDto) {
    return this.businessAnalyticsAgentService.analyze(dto);
  }
}
