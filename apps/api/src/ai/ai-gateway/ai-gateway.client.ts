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

export interface AiEmbeddingResult {
  embeddings: number[][];
  provider: string;
  model: string;
  latencyMs: number;
  usedFallback: boolean;
}

/** ai-service /contract/extract 的返回（字段名沿用 Python 侧的 snake_case）。 */
export interface ContractExtractWarning {
  field: string;
  level: 'missing' | 'warn' | 'info';
  message: string;
  page: number | null;
}

export interface ContractExtractData {
  contract_no: string | null;
  signed_date: string | null;
  mother_name: string | null;
  id_card_no: string | null;
  phone: string | null;
  hospital: string | null;
  address: string | null;
  emergency_name: string | null;
  emergency_relation: string | null;
  emergency_phone: string | null;
  fetus: 'single' | 'twin' | 'multi' | null;
  due_date: string | null;
  room_type_text: string | null;
  orientation: 'SOUTH' | 'NORTH' | 'BOTH' | null;
  care_mode: 'ONE_TO_ONE' | 'ONE_TO_TWO' | null;
  days_text: string | null;
  in_house_days: number | null;
  home_service_days: number | null;
  package_amount: number | null; // 元
  deposit_amount: number | null; // 元
  gift_items: { name: string; quantity: string | null; needs_review: boolean; page: number }[];
  extra_notes: { where: string | null; text: string; page: number; kind: string | null }[];
}

export interface ContractExtractResult {
  data: ContractExtractData;
  warnings: ContractExtractWarning[];
  pages: { index: number; kind: string | null; printed_page_no: number | null; source_name: string; jpeg_b64: string }[];
  raw_pages: unknown[];
  focus: unknown;
  focus_amounts: unknown;
  model: string | null;
  latency_ms: number;
}

export interface CareFormExtractResult {
  data: Record<string, unknown>;
  warnings: { field: string; level: 'info' | 'warn' | 'missing'; message: string }[];
  model: string | null;
  latency_ms: number;
  page_count: number;
}

/**
 * apps/api 到 apps/ai-service 模型网关的 HTTP 客户端。用共享密钥做服务间认证
 * （见业务规则确认记录"P4模型网关"章节），不做完整的服务间 OAuth。
 */
@Injectable()
export class AiGatewayClient {
  constructor(private readonly configService: ConfigService) {}

  async complete(messages: AiChatMessage[]): Promise<AiChatResult> {
    const data = await this.post<{ content: string; provider: string; model: string; latency_ms: number; used_fallback: boolean }>('/chat/complete', {
      messages,
    });
    return { content: data.content, provider: data.provider, model: data.model, latencyMs: data.latency_ms, usedFallback: data.used_fallback };
  }

  async embed(texts: string[]): Promise<AiEmbeddingResult> {
    const data = await this.post<{ embeddings: number[][]; provider: string; model: string; latency_ms: number; used_fallback: boolean }>(
      '/embeddings/create',
      { texts },
    );
    return { embeddings: data.embeddings, provider: data.provider, model: data.model, latencyMs: data.latency_ms, usedFallback: data.used_fallback };
  }

  /** 纸质合同读图识别（PDF/照片）。识别一份合同要几十秒到两分钟，超时单独放宽到 5 分钟。 */
  async extractContract(files: { name: string; data: Buffer }[]): Promise<ContractExtractResult> {
    return this.post<ContractExtractResult>(
      '/contract/extract',
      { files: files.map((f) => ({ name: f.name, data_b64: f.data.toString('base64') })) },
      5 * 60 * 1000,
    );
  }

  /** 护理纸质表格读图识别：字段说明书（assessment-specs）随请求传给 AI 服务。 */
  async extractCareForm(
    spec: { formTitle: string; description: string; fields: unknown[] },
    files: { name: string; data: Buffer }[],
  ): Promise<CareFormExtractResult> {
    return this.post<CareFormExtractResult>(
      '/care-form/extract',
      {
        form_title: spec.formTitle,
        description: spec.description,
        fields: spec.fields,
        files: files.map((f) => ({ name: f.name, data_b64: f.data.toString('base64') })),
      },
      5 * 60 * 1000,
    );
  }

  /** 把一张照片（含苹果 HEIC）转成方向正确的 JPEG，浏览器才能直接显示。 */
  async normalizeImage(data: Buffer): Promise<Buffer> {
    const res = await this.post<{ jpeg_b64: string }>('/care-form/normalize', { data_b64: data.toString('base64') }, 60_000);
    return Buffer.from(res.jpeg_b64, 'base64');
  }

  private async post<T>(path: string, body: unknown, timeoutMs = 60_000): Promise<T> {
    const baseUrl = this.configService.get<string>('AI_GATEWAY_BASE_URL') ?? 'http://localhost:8000';
    const apiKey = this.configService.get<string>('AI_GATEWAY_INTERNAL_API_KEY') ?? '';

    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Api-Key': apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new ServiceUnavailableException(`AI 模型网关调用失败：${(err as Error).message}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ServiceUnavailableException(`AI 模型网关返回错误(${res.status})：${text}`);
    }
    return (await res.json()) as T;
  }
}
