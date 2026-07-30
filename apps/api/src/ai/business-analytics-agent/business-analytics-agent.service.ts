import { Injectable } from '@nestjs/common';
import { AiSuggestion } from '@prisma/client';
import { BusinessReportService, FinanceSummary, OccupancySummary } from '../../analytics/business-report/business-report.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { AiGatewayClient } from '../ai-gateway/ai-gateway.client';
import { AiSuggestionService } from '../ai-suggestion/ai-suggestion.service';
import { AnalyzeBusinessDto } from './dto/analyze-business.dto';

const SYSTEM_PROMPT = `你是伴月轩月子中心的经营分析助手，服务对象是店长/管理员。
基于系统提供的门店经营数据（收款、会员账户、房态入住率），生成简明的经营分析解读：
说明当前经营状况、指出值得关注的异常或趋势、给出可以进一步关注的方向。
严格要求：
1. 只依据提供的数据作答，不编造数据中没有的信息，不做超出数据范围的推测。
2. 你的分析仅供管理参考，不构成正式经营决策依据，最终决策需要管理者结合更多信息判断。
3. 只做只读分析，不要生成任何"已执行/已调整"之类暗示系统会自动操作的表述。`;

export interface BusinessAnalysisResult {
  suggestion: AiSuggestion;
  financeSummary: FinanceSummary;
  occupancySummary: OccupancySummary;
}

/**
 * 经营分析Agent：只读分析，不产生任何写操作（本轮只做管理员/店长主动点击生成，
 * 不做开发文档提到的"定时(日/周)自动触发"——系统暂无调度基础设施，
 * 见业务规则确认记录"P5经营分析看板实现中"）。
 */
@Injectable()
export class BusinessAnalyticsAgentService {
  constructor(
    private readonly businessReportService: BusinessReportService,
    private readonly aiGatewayClient: AiGatewayClient,
    private readonly aiSuggestionService: AiSuggestionService,
    private readonly ctx: RequestContextService,
  ) {}

  async analyze(dto: AnalyzeBusinessDto): Promise<BusinessAnalysisResult> {
    const [financeSummary, occupancySummary] = await Promise.all([
      this.businessReportService.getFinanceSummary(dto),
      this.businessReportService.getOccupancySummary(dto),
    ]);

    const contextText = this.buildContext(financeSummary, occupancySummary);
    const userMessage = `【经营数据（${dto.startDate} ~ ${dto.endDate}）】\n${contextText}`;

    const startedAt = Date.now();
    const result = await this.aiGatewayClient.complete([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ]);
    const latencyMs = result.latencyMs || Date.now() - startedAt;

    const storeScope = financeSummary.storeScope;
    const suggestion = await this.aiSuggestionService.record({
      storeId: dto.storeId ?? this.ctx.homeStoreId ?? storeScope,
      scenario: 'BUSINESS_ANALYTICS',
      businessType: 'BUSINESS_ANALYTICS_REPORT',
      businessId: `${storeScope}_${dto.startDate}_${dto.endDate}`,
      inputText: userMessage,
      outputText: result.content,
      modelProvider: result.provider,
      modelName: result.model,
      usedFallback: result.usedFallback,
      latencyMs,
    });

    return { suggestion, financeSummary, occupancySummary };
  }

  private buildContext(finance: FinanceSummary, occupancy: OccupancySummary): string {
    const yuan = (cents: number) => (cents / 100).toFixed(2);
    const byMethodText = finance.paymentByMethod.map((m) => `${m.method}:${yuan(m.amount)}元`).join('、') || '无';

    return [
      `统计范围：${finance.storeScope === 'ALL' ? '全租户汇总' : `门店${finance.storeScope}`}`,
      `【财务】`,
      `收款总额：${yuan(finance.paymentTotalAmount)}元（按支付方式：${byMethodText}）`,
      `已退款金额：${yuan(finance.paymentRefundedAmount)}元`,
      `会员账户-充值：${yuan(finance.accountRechargeAmount)}元，消费：${yuan(finance.accountConsumeAmount)}元，退款：${yuan(finance.accountRefundAmount)}元，人工调整：${yuan(finance.accountAdjustAmount)}元`,
      `会员账户当前总余额（截至现在）：${yuan(finance.accountCurrentBalance)}元`,
      `【房态】`,
      `房间总数：${occupancy.totalRooms}间`,
      `区间日均入住率：${(occupancy.averageOccupancyRate * 100).toFixed(1)}%`,
      `每日入住率明细：${occupancy.daily.map((d) => `${d.date}:${(d.occupancyRate * 100).toFixed(0)}%(${d.occupiedRooms}/${d.totalRooms})`).join('，')}`,
    ].join('\n');
  }
}
