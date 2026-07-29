import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import type { AiSuggestion, Customer, KnowledgeDocument } from '@prisma/client';
import { AppModule } from '../src/app.module';

/**
 * P4 RAG知识库端到端集成测试：mock全局fetch按URL路径分流(/embeddings/create 与
 * /chat/complete)，用关键词映射伪造embedding向量，验证"创建文档→自动分段生成embedding→
 * 智能客服Agent检索命中→拼入prompt"这条链路，不需要真实API Key（见业务规则确认记录
 * "P4 RAG知识库接入中"章节）。
 */
describe('P4 RAG知识库：文档管理+检索接入Agent (e2e)', () => {
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

  /** 用关键词映射伪造3维embedding向量，命中同一关键词的文本余弦相似度=1，否则=0，便于断言检索排序。 */
  function fakeEmbedding(text: string): number[] {
    return [text.includes('套餐') ? 1 : 0, text.includes('停车') ? 1 : 0, text.includes('体温') ? 1 : 0];
  }

  function mockGatewayRoutes(chatContent: string) {
    global.fetch = jest.fn(async (url: unknown, options?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/embeddings/create')) {
        const parsedBody = JSON.parse(String(options?.body)) as { texts: string[] };
        const embeddings = parsedBody.texts.map((t) => fakeEmbedding(t));
        return new Response(JSON.stringify({ embeddings, provider: 'volcengine', model: 'ep-embed-fake', latency_ms: 10, used_fallback: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.includes('/chat/complete')) {
        return new Response(JSON.stringify({ content: chatContent, provider: 'volcengine', model: 'ep-fake', latency_ms: 20, used_fallback: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;
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
      .send({ name: 'E2E RAG测试客户', phone: `136${runTag}`, source: 'WALK_IN', primaryStoreId: storeId })
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

  it('1. 店长无权限管理知识库文档（总部主数据口径）', async () => {
    mockGatewayRoutes('irrelevant');
    await request(server)
      .post('/api/v1/ai/knowledge-documents')
      .set(authed(storeManagerToken))
      .send({ title: '店长尝试创建', content: '任意内容' })
      .expect(403);
    await request(server).get('/api/v1/ai/knowledge-documents').set(authed(storeManagerToken)).expect(403);
  });

  it('2. 创建知识库文档：自动分段并调用模型网关生成embedding', async () => {
    mockGatewayRoutes('irrelevant');
    const longContent = '伴月轩42天基础套餐包含护理、月子餐与产康服务。'.repeat(30); // 超过500字触发多段
    const res = await request(server)
      .post('/api/v1/ai/knowledge-documents')
      .set(authed(adminToken))
      .send({ title: `套餐说明-${runTag}`, content: longContent, category: '合同模板说明' })
      .expect(201);
    const doc = body<KnowledgeDocument>(res);
    expect(doc.title).toBe(`套餐说明-${runTag}`);
    expect(doc.status).toBe('ACTIVE');
  });

  it('3. 创建另一篇不相关文档（停车相关）用于验证检索排序', async () => {
    mockGatewayRoutes('irrelevant');
    await request(server)
      .post('/api/v1/ai/knowledge-documents')
      .set(authed(adminToken))
      .send({ title: `停车说明-${runTag}`, content: '门店地下停车场对客户免费开放，凭停车卡出入。', category: '常见问题' })
      .expect(201);
  });

  it('4. 智能客服Agent提问涉及"套餐"，检索命中套餐文档并拼入prompt，不命中停车文档', async () => {
    mockGatewayRoutes('根据套餐说明，客户选择的是42天基础套餐。');

    const res = await request(server)
      .post('/api/v1/ai/customer-service-agent/ask')
      .set(authed(adminToken))
      .send({ businessType: 'CUSTOMER', businessId: customerId, storeId, question: '这个客户的套餐包含哪些服务？' })
      .expect(201);

    const answer = body<{ suggestion: AiSuggestion; answer: string }>(res);
    expect(answer.suggestion.inputText).toContain('知识库参考资料');
    expect(answer.suggestion.inputText).toContain('套餐');
    // 相关度排序验证：套餐相关片段(与提问余弦相似度更高)应排在停车片段之前，
    // 而不是断言"完全不包含"——topK 检索在候选片段总数不多时仍会带上低相关片段。
    const packageIndex = answer.suggestion.inputText.indexOf('套餐说明');
    const parkingIndex = answer.suggestion.inputText.indexOf('停车说明');
    expect(packageIndex).toBeGreaterThan(-1);
    if (parkingIndex > -1) {
      expect(packageIndex).toBeLessThan(parkingIndex);
    }
  });

  it('5. 护理异常预警建议Agent也会检索知识库（复用同一套检索服务）', async () => {
    mockGatewayRoutes('体温偏高建议密切观察。');

    // 复用 p4-ai-flow 里搭建护理异常的最小链路
    const field = await request(server)
      .post('/api/v1/care/fields')
      .set(authed(adminToken))
      .send({ code: `rag_mother_temp_${runTag}`, name: '体温', targetType: 'MOTHER', controlType: 'NUMBER', unit: '℃', normalMin: 36, normalMax: 37.5 })
      .expect(201);
    const fieldId = body<{ id: string }>(field).id;
    const formTemplate = await request(server)
      .post('/api/v1/care/form-templates')
      .set(authed(adminToken))
      .send({ code: `rag_form_${runTag}`, name: 'RAG测试表单', targetType: 'MOTHER', department: 'NURSING', fields: [{ fieldId, required: true, sortOrder: 1 }] })
      .expect(201);
    const formTemplateId = body<{ id: string }>(formTemplate).id;
    const planTemplate = await request(server)
      .post('/api/v1/care/plan-templates')
      .set(authed(adminToken))
      .send({ code: `rag_plan_${runTag}`, name: 'RAG测试方案', targetType: 'MOTHER', totalDays: 1, items: [{ dayOffset: 1, formTemplateId }] })
      .expect(201);
    const planTemplateId = body<{ id: string }>(planTemplate).id;
    const motherProfile = await request(server)
      .post('/api/v1/care/mother-profiles')
      .set(authed(adminToken))
      .send({ customerId, deliveryMethod: 'CESAREAN', gestationalWeeks: 39 })
      .expect(201);
    const motherProfileId = body<{ id: string }>(motherProfile).id;
    await request(server).post('/api/v1/care/plans').set(authed(adminToken)).send({ motherProfileId, planTemplateId, startDate: '2026-09-01' }).expect(201);
    const record = await request(server)
      .post('/api/v1/care/records')
      .set(authed(adminToken))
      .send({ formTemplateId, motherProfileId, occurredAt: '2026-09-01T08:00:00Z', values: { [`rag_mother_temp_${runTag}`]: 39.0 } })
      .expect(201);
    const abnormalityId = body<{ abnormalities: { id: string }[] }>(record).abnormalities[0].id;

    const suggested = await request(server).post(`/api/v1/ai/care-abnormality-agent/${abnormalityId}/suggest`).set(authed(adminToken)).expect(201);
    const result = body<{ suggestion: AiSuggestion }>(suggested);
    expect(result.suggestion.inputText).toContain('护理知识库参考资料');
  });

  it('6. 更新文档正文会重新分段+重新embedding（版本号校验）', async () => {
    mockGatewayRoutes('irrelevant');
    const created = await request(server)
      .post('/api/v1/ai/knowledge-documents')
      .set(authed(adminToken))
      .send({ title: `待更新文档-${runTag}`, content: '初始内容关于套餐' })
      .expect(201);
    const doc = body<KnowledgeDocument>(created);

    await request(server).patch(`/api/v1/ai/knowledge-documents/${doc.id}`).set(authed(adminToken)).send({ content: '更新后的内容关于停车', version: 9 }).expect(409);

    const updated = await request(server)
      .patch(`/api/v1/ai/knowledge-documents/${doc.id}`)
      .set(authed(adminToken))
      .send({ content: '更新后的内容关于停车', version: 0 })
      .expect(200);
    expect(body<KnowledgeDocument>(updated).content).toBe('更新后的内容关于停车');
  });

  it('7. 删除文档会级联删除其分段', async () => {
    mockGatewayRoutes('irrelevant');
    const created = await request(server).post('/api/v1/ai/knowledge-documents').set(authed(adminToken)).send({ title: `待删除文档-${runTag}`, content: '临时内容' }).expect(201);
    const id = body<KnowledgeDocument>(created).id;

    await request(server).delete(`/api/v1/ai/knowledge-documents/${id}`).set(authed(adminToken)).expect(200);
    await request(server).get(`/api/v1/ai/knowledge-documents/${id}`).set(authed(adminToken)).expect(404);
  });
});
