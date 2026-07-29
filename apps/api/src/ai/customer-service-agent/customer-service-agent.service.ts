import { Injectable, NotFoundException } from '@nestjs/common';
import { AiSuggestion } from '@prisma/client';
import { LeadService } from '../../crm/lead/lead.service';
import { CustomerService } from '../../crm/customer/customer.service';
import { FollowUpService } from '../../crm/follow-up/follow-up.service';
import { AiGatewayClient } from '../ai-gateway/ai-gateway.client';
import { AiSuggestionService } from '../ai-suggestion/ai-suggestion.service';
import { AskCustomerServiceDto } from './dto/ask-customer-service.dto';

const ESCALATE_MARKER = '[[ESCALATE]]';

const SYSTEM_PROMPT = `你是伴月轩月子中心的内部客服助手，服务对象是门店员工（销售/客服），不是直接面向客户对话。
你的任务是基于系统提供的客户/线索背景资料，帮员工快速理解情况、给出沟通建议或信息查询结果。
严格要求：
1. 只依据提供的背景资料作答，不要编造资料中没有的信息（如具体报价、优惠承诺）。
2. 如果问题涉及最终报价、法律条款、投诉处理等复杂或敏感事项，或者背景资料不足以回答，
   请在回答末尾追加一行 ${ESCALATE_MARKER}，提示需要转人工处理。
3. 回答仅供员工参考，不代表最终决定。`;

export interface CustomerServiceAnswer {
  suggestion: AiSuggestion;
  answer: string;
  escalate: boolean;
}

/**
 * 智能客服 / 线索首触 Agent：服务对象是门店员工（帮员工快速理解客户背景、组织回复），
 * 不是直接对客的公开聊天入口——本系统没有客户可直接访问的前端渠道。
 */
@Injectable()
export class CustomerServiceAgentService {
  constructor(
    private readonly leadService: LeadService,
    private readonly customerService: CustomerService,
    private readonly followUpService: FollowUpService,
    private readonly aiGatewayClient: AiGatewayClient,
    private readonly aiSuggestionService: AiSuggestionService,
  ) {}

  async ask(dto: AskCustomerServiceDto): Promise<CustomerServiceAnswer> {
    const contextText = await this.buildContext(dto.businessType, dto.businessId);

    const userMessage = `【客户/线索背景资料】\n${contextText}\n\n【员工提问】\n${dto.question}`;
    const startedAt = Date.now();
    const result = await this.aiGatewayClient.complete([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ]);
    const latencyMs = result.latencyMs || Date.now() - startedAt;

    const escalate = result.content.includes(ESCALATE_MARKER);
    const answer = result.content.replace(ESCALATE_MARKER, '').trim();

    const suggestion = await this.aiSuggestionService.record({
      storeId: dto.storeId,
      scenario: 'CUSTOMER_SERVICE',
      businessType: dto.businessType,
      businessId: dto.businessId,
      inputText: userMessage,
      outputText: answer,
      modelProvider: result.provider,
      modelName: result.model,
      usedFallback: result.usedFallback,
      latencyMs,
      escalate,
    });

    return { suggestion, answer, escalate };
  }

  private async buildContext(businessType: 'LEAD' | 'CUSTOMER', businessId: string): Promise<string> {
    if (businessType === 'LEAD') {
      const lead = await this.leadService.findOneOrThrow(businessId);
      const followUps = await this.followUpService.findMany('LEAD', businessId);
      const recentFollowUps = followUps
        .slice(0, 5)
        .map((f) => `- ${f.createdAt.toISOString().slice(0, 10)} [${f.type}] ${f.content}`)
        .join('\n');
      return [
        `线索姓名：${lead.name}`,
        `联系电话：${lead.phone}`,
        `来源：${lead.source}`,
        `当前状态：${lead.status}`,
        lead.remark ? `备注：${lead.remark}` : null,
        recentFollowUps ? `最近跟进记录：\n${recentFollowUps}` : '暂无跟进记录',
      ]
        .filter(Boolean)
        .join('\n');
    }

    const customer = await this.customerService.findOneOrThrow(businessId);
    if (!customer) throw new NotFoundException(`Customer ${businessId} 不存在`);
    const followUps = await this.followUpService.findMany('CUSTOMER', businessId);
    const recentFollowUps = followUps
      .slice(0, 5)
      .map((f) => `- ${f.createdAt.toISOString().slice(0, 10)} [${f.type}] ${f.content}`)
      .join('\n');
    return [
      `客户姓名：${customer.name}`,
      `联系电话：${customer.phone}`,
      `客户来源：${customer.source}`,
      customer.remark ? `备注：${customer.remark}` : null,
      recentFollowUps ? `最近跟进记录：\n${recentFollowUps}` : '暂无跟进记录',
    ]
      .filter(Boolean)
      .join('\n');
  }
}
