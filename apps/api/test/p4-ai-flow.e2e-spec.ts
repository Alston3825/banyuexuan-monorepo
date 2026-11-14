import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import type { AiSuggestion, CareFieldDefinition, CareFormTemplate, CarePlanTemplate, Customer, MotherProfile } from '@prisma/client';
import { AppModule } from '../src/app.module';

/**
 * P4 AI域端到端集成测试：模型网关不做真实外呼（无真实API Key，见业务规则确认记录
 * "P4模型网关"章节），本测试 mock 全局 fetch 拦截对 apps/ai-service 的调用，验证
 * NestJS 侧的上下文组装、AiSuggestion留痕、转人工判定、接受/忽略状态流转与权限。
 */
describe('P4 AI域：智能客服Agent+护理异常建议Agent (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let originalFetch: typeof fetch;

  const SEED_PASSWORD = 'Passw0rd!23';
  const runTag = Date.now().toString().slice(-8);

  let adminToken: string;
  let storeManagerToken: string;
  let storeId: string;
  let customerId: string;

  function authed(token: string) {
    return { Authorization: `Bearer ${token}` };
  }
  function body<T>(res: request.Response): T {
    return res.body as T;
  }
  interface LoginResponse {
    accessToken: string;
  }

  /**
   * mock 需要按 URL 区分 /chat/complete 与 /embeddings/create 两个端点——数据库是共享的本地
   * 开发库、不做测试隔离，RAG知识库测试(p4-rag-flow)留下的 KnowledgeChunk 会让本文件的
   * Agent调用也触发一次 embed() 检索调用，两个端点的响应体形状不同，必须分别处理。
   */
  function mockGatewaySuccess(content: string) {
    global.fetch = jest.fn(async (url: unknown) => {
      if (String(url).includes('/embeddings/create')) {
        return new Response(
          JSON.stringify({ embeddings: [[0, 0, 0]], provider: 'volcengine', model: 'ep-embed-fake', latency_ms: 5, used_fallback: false }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({ content, provider: 'volcengine', model: 'ep-fake', latency_ms: 123, used_fallback: false }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as unknown as typeof fetch;
  }

  function mockGatewayUnavailable() {
    global.fetch = jest.fn(async () => new Response('service down', { status: 503 })) as unknown as typeof fetch;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();

    const adminLogin = await request(server).post('/api/v1/auth/login').send({ username: 'admin', password: SEED_PASSWORD }).expect(201);
    adminToken = body<LoginResponse>(adminLogin).accessToken;
    const storeManagerLogin = await request(server).post('/api/v1/auth/login').send({ username: 'store_manager', password: SEED_PASSWORD }).expect(201);
    storeManagerToken = body<LoginResponse>(storeManagerLogin).accessToken;

    const stores = await request(server).get('/api/v1/platform/stores').set(authed(adminToken)).expect(200);
    storeId = body<{ id: string }[]>(stores)[0].id;

    const customer = await request(server)
      .post('/api/v1/crm/customers')
      .set(authed(adminToken))
      .send({ name: 'E2E AI测试客户', phone: `137${runTag}`, source: 'WALK_IN', primaryStoreId: storeId })
      .expect(201);
    customerId = body<Customer>(customer).id;

    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  afterAll(async () => {
    await app.close();
  });

  // ==================== 智能客服 Agent ====================

  it('1. 智能客服Agent：正常问答，不触发转人工标记', async () => {
    mockGatewaySuccess('根据历史记录，该客户对42天基础套餐感兴趣，建议跟进套餐详情。');

    const res = await request(server)
      .post('/api/v1/ai/customer-service-agent/ask')
      .set(authed(adminToken))
      .send({ businessType: 'CUSTOMER', businessId: customerId, storeId, question: '这个客户目前跟进到什么阶段了？' })
      .expect(201);

    const answer = body<{ suggestion: AiSuggestion; answer: string; escalate: boolean }>(res);
    expect(answer.escalate).toBe(false);
    expect(answer.answer).toContain('42天基础套餐');
    expect(answer.suggestion.scenario).toBe('CUSTOMER_SERVICE');
    expect(answer.suggestion.status).toBe('PENDING');
    expect(answer.suggestion.modelProvider).toBe('volcengine');
  });

  it('2. 智能客服Agent：模型返回转人工标记时应识别并从回答文本中剥离', async () => {
    mockGatewaySuccess('涉及最终报价，建议转人工处理。\n[[ESCALATE]]');

    const res = await request(server)
      .post('/api/v1/ai/customer-service-agent/ask')
      .set(authed(adminToken))
      .send({ businessType: 'CUSTOMER', businessId: customerId, storeId, question: '能不能再优惠5000元？' })
      .expect(201);

    const answer = body<{ suggestion: AiSuggestion; answer: string; escalate: boolean }>(res);
    expect(answer.escalate).toBe(true);
    expect(answer.answer).not.toContain('[[ESCALATE]]');
  });

  it('3. 智能客服Agent：模型网关不可用时返回503，不产生AiSuggestion记录', async () => {
    mockGatewayUnavailable();

    const before = await request(server).get('/api/v1/ai/suggestions').query({ businessId: customerId }).set(authed(adminToken)).expect(200);
    const beforeCount = body<AiSuggestion[]>(before).length;

    await request(server)
      .post('/api/v1/ai/customer-service-agent/ask')
      .set(authed(adminToken))
      .send({ businessType: 'CUSTOMER', businessId: customerId, storeId, question: '任意问题' })
      .expect(503);

    const after = await request(server).get('/api/v1/ai/suggestions').query({ businessId: customerId }).set(authed(adminToken)).expect(200);
    expect(body<AiSuggestion[]>(after).length).toBe(beforeCount);
  });

  it('4. AI建议：接受/忽略状态流转 + 错误版本号返回409', async () => {
    mockGatewaySuccess('测试建议内容');
    const created = await request(server)
      .post('/api/v1/ai/customer-service-agent/ask')
      .set(authed(adminToken))
      .send({ businessType: 'CUSTOMER', businessId: customerId, storeId, question: '测试问题' })
      .expect(201);
    const suggestionId = body<{ suggestion: AiSuggestion }>(created).suggestion.id;

    await request(server).post(`/api/v1/ai/suggestions/${suggestionId}/accept`).set(authed(adminToken)).send({ version: 9 }).expect(409);

    const accepted = await request(server).post(`/api/v1/ai/suggestions/${suggestionId}/accept`).set(authed(adminToken)).send({ version: 0 }).expect(201);
    expect(body<AiSuggestion>(accepted).status).toBe('ACCEPTED');
    expect(body<AiSuggestion>(accepted).acceptedById).toBeTruthy();

    await request(server).post(`/api/v1/ai/suggestions/${suggestionId}/dismiss`).set(authed(adminToken)).send({ version: 1 }).expect(400);
  });

  // ==================== 护理异常预警建议 Agent ====================

  it('5. 护理异常建议Agent：组装护理异常上下文并生成建议，仅留痕不写入护理记录', async () => {
    // 最小化搭建：字段(体温,异常阈值) -> 表单模板 -> 方案模板 -> 妈妈档案 -> 计划 -> 提交超范围记录触发异常
    const field = await request(server)
      .post('/api/v1/care/fields')
      .set(authed(adminToken))
      .send({ code: `ai_mother_temp_${runTag}`, name: '体温', targetType: 'MOTHER', controlType: 'NUMBER', unit: '℃', normalMin: 36, normalMax: 37.5 })
      .expect(201);
    const fieldId = body<CareFieldDefinition>(field).id;

    const formTemplate = await request(server)
      .post('/api/v1/care/form-templates')
      .set(authed(adminToken))
      .send({ code: `ai_mother_daily_${runTag}`, name: 'AI测试表单', targetType: 'MOTHER', department: 'NURSING', fields: [{ fieldId, required: true, sortOrder: 1 }] })
      .expect(201);
    const formTemplateId = body<CareFormTemplate>(formTemplate).id;

    const planTemplate = await request(server)
      .post('/api/v1/care/plan-templates')
      .set(authed(adminToken))
      .send({ code: `ai_plan_${runTag}`, name: 'AI测试方案', targetType: 'MOTHER', totalDays: 1, items: [{ dayOffset: 1, formTemplateId }] })
      .expect(201);
    const planTemplateId = body<CarePlanTemplate>(planTemplate).id;

    const motherProfile = await request(server)
      .post('/api/v1/care/mother-profiles')
      .set(authed(adminToken))
      .send({ customerId, deliveryMethod: 'CESAREAN', gestationalWeeks: 39 })
      .expect(201);
    const motherProfileId = body<MotherProfile>(motherProfile).id;

    await request(server).post('/api/v1/care/plans').set(authed(adminToken)).send({ motherProfileId, planTemplateId, startDate: '2026-08-01' }).expect(201);

    const record = await request(server)
      .post('/api/v1/care/records')
      .set(authed(adminToken))
      .send({ formTemplateId, motherProfileId, occurredAt: '2026-08-01T08:00:00Z', values: { [`ai_mother_temp_${runTag}`]: 39.2 } })
      .expect(201);
    const abnormalityId = body<{ abnormalities: { id: string }[] }>(record).abnormalities[0].id;

    mockGatewaySuccess('体温偏高可能与产褥感染或环境闷热有关，建议密切监测体温变化并知会主治医生。');

    const suggested = await request(server).post(`/api/v1/ai/care-abnormality-agent/${abnormalityId}/suggest`).set(authed(adminToken)).expect(201);
    const result = body<{ suggestion: AiSuggestion; answer: string }>(suggested);
    expect(result.suggestion.scenario).toBe('CARE_ABNORMALITY');
    expect(result.suggestion.businessId).toBe(abnormalityId);
    expect(result.answer).toContain('体温');

    // 护理异常状态不受AI建议影响，仍保持 OPEN，只有护理师手动跟进/处理才会推进状态
    const abnormality = await request(server).get(`/api/v1/care/abnormalities/${abnormalityId}`).set(authed(adminToken)).expect(200);
    expect(body<{ status: string }>(abnormality).status).toBe('OPEN');
  });

  // ==================== 权限 ====================

  it('6. 权限：店长可以使用智能客服Agent与护理异常建议Agent（辅助工具全部开放）', async () => {
    mockGatewaySuccess('店长视角测试回答');
    await request(server)
      .post('/api/v1/ai/customer-service-agent/ask')
      .set(authed(storeManagerToken))
      .send({ businessType: 'CUSTOMER', businessId: customerId, storeId, question: '店长测试问题' })
      .expect(201);
    await request(server).get('/api/v1/ai/suggestions').set(authed(storeManagerToken)).expect(200);
  });
});
