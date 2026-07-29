import { Injectable } from '@nestjs/common';
import { AiSuggestion } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CareAbnormalityService } from '../../care/care-abnormality/care-abnormality.service';
import { AiGatewayClient } from '../ai-gateway/ai-gateway.client';
import { AiSuggestionService } from '../ai-suggestion/ai-suggestion.service';

const SYSTEM_PROMPT = `你是伴月轩月子中心的护理助手，服务对象是护理师，不是产妇/家属。
你的任务是基于系统提供的护理异常信息，给出可能的原因分析与建议的跟进方向，帮助护理师判断。
严格要求：
1. 你的输出只是建议，不是医疗诊断，不构成任何医嘱。
2. 护理师必须自行判断并人工确认后，才能将处理结果写入正式护理记录——你没有任何直接写入
   护理档案的权限，也不应在回答中暗示"已经处理"。
3. 回答控制在3句话以内，直接给出可能原因与下一步建议，不要输出免责声明以外的客套话。`;

/**
 * 护理异常预警建议 Agent：护理指标录入后自动触发的 CareAbnormality 上，护理师可主动
 * 点击"获取AI建议"生成一条建议；AI 只生成文本建议，绝不自动写入 CareRecord/CareAbnormality，
 * 护理师需人工确认后才能采纳（不支持"一键采纳"，见业务规则确认记录#9）。
 */
@Injectable()
export class CareAbnormalityAgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly careAbnormalityService: CareAbnormalityService,
    private readonly aiGatewayClient: AiGatewayClient,
    private readonly aiSuggestionService: AiSuggestionService,
  ) {}

  async suggest(abnormalityId: string): Promise<{ suggestion: AiSuggestion; answer: string }> {
    const abnormality = await this.careAbnormalityService.findOneOrThrow(abnormalityId);
    const contextText = await this.buildContext(abnormality);

    const startedAt = Date.now();
    const result = await this.aiGatewayClient.complete([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: contextText },
    ]);
    const latencyMs = result.latencyMs || Date.now() - startedAt;

    const suggestion = await this.aiSuggestionService.record({
      storeId: abnormality.storeId,
      scenario: 'CARE_ABNORMALITY',
      businessType: 'CARE_ABNORMALITY',
      businessId: abnormalityId,
      inputText: contextText,
      outputText: result.content,
      modelProvider: result.provider,
      modelName: result.model,
      usedFallback: result.usedFallback,
      latencyMs,
    });

    return { suggestion, answer: result.content };
  }

  private async buildContext(abnormality: {
    fieldId: string;
    motherProfileId: string | null;
    babyProfileId: string | null;
    occurredAt: Date;
    fieldValue: unknown;
  }): Promise<string> {
    const field = await this.prisma.careFieldDefinition.findUnique({ where: { id: abnormality.fieldId } });
    const normalRange = field?.normalOptionValues
      ? `正常选项：${JSON.stringify(field.normalOptionValues)}`
      : `正常范围：${field?.normalMin ?? '不限'} ~ ${field?.normalMax ?? '不限'}${field?.unit ? ` ${field.unit}` : ''}`;

    let subject = '未知对象';
    if (abnormality.babyProfileId) {
      const baby = await this.prisma.babyProfile.findUnique({ where: { id: abnormality.babyProfileId } });
      subject = `宝宝${baby?.name ? `（${baby.name}）` : `${baby?.sequenceNo ?? ''}号`}`;
    } else if (abnormality.motherProfileId) {
      const mother = await this.prisma.motherProfile.findUnique({ where: { id: abnormality.motherProfileId }, include: { customer: true } });
      subject = `妈妈（${mother?.customer.name ?? '未知'}）`;
    }

    return [
      `对象：${subject}`,
      `异常项目：${field?.name ?? abnormality.fieldId}`,
      `记录时间：${abnormality.occurredAt.toISOString()}`,
      `实际值：${JSON.stringify(abnormality.fieldValue)}`,
      normalRange,
      '请给出可能原因与建议的护理跟进方向。',
    ].join('\n');
  }
}
