import { Module } from '@nestjs/common';
import { BusinessReportModule } from '../../analytics/business-report/business-report.module';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';
import { AiSuggestionModule } from '../ai-suggestion/ai-suggestion.module';
import { BusinessAnalyticsAgentController } from './business-analytics-agent.controller';
import { BusinessAnalyticsAgentService } from './business-analytics-agent.service';

@Module({
  imports: [BusinessReportModule, AiGatewayModule, AiSuggestionModule],
  controllers: [BusinessAnalyticsAgentController],
  providers: [BusinessAnalyticsAgentService],
})
export class BusinessAnalyticsAgentModule {}
