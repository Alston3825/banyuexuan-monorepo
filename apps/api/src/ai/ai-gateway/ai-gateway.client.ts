import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiChatResult {
  content: string;
  provider: string;
  model: string;
  latencyMs: number;
  usedFallback: boolean;
}

/**
 * apps/api 到 apps/ai-service 模型网关的 HTTP 客户端。用共享密钥做服务间认证
 * （见业务规则确认记录"P4模型网关"章节），不做完整的服务间 OAuth。
 */
@Injectable()
export class AiGatewayClient {
  constructor(private readonly configService: ConfigService) {}

  async complete(messages: AiChatMessage[]): Promise<AiChatResult> {
    const baseUrl = this.configService.get<string>('AI_GATEWAY_BASE_URL') ?? 'http://localhost:8000';
    const apiKey = this.configService.get<string>('AI_GATEWAY_INTERNAL_API_KEY') ?? '';

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/chat/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Api-Key': apiKey },
        body: JSON.stringify({ messages }),
      });
    } catch (err) {
      throw new ServiceUnavailableException(`AI 模型网关调用失败：${(err as Error).message}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ServiceUnavailableException(`AI 模型网关返回错误(${res.status})：${text}`);
    }
    const data = (await res.json()) as { content: string; provider: string; model: string; latency_ms: number; used_fallback: boolean };
    return { content: data.content, provider: data.provider, model: data.model, latencyMs: data.latency_ms, usedFallback: data.used_fallback };
  }
}
