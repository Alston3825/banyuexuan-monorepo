import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import type { CareOutreachPlan, CareOutreachTemplate, Customer, MotherProfile } from '@prisma/client';
import { AppModule } from '../src/app.module';

/**
 * P5 离店后关怀跟踪端到端集成测试：关怀模板为总部统一运营标准(仅SUPER_ADMIN维护)，
 * 生成计划/完成任务由店长手动操作(用店长账号代表护理人员)。见业务规则确认记录
 * "离店后关怀跟踪模块实现中"——本测试不涉及任何具体医学随访规则，节点内容均为占位文本。
 */
describe('P5 离店后关怀跟踪 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;

  const SEED_PASSWORD = 'Passw0rd!23';
  const runTag = Date.now().toString().slice(-8);

  let adminToken: string;
  let storeManagerToken: string;
  let otherStoreManagerToken: string; // test_user，绑定另一门店，用于验证跨店越权已修复
  let customerId: string;
  let motherProfileId: string;
  let templateId: string;
  let planId: string;
  let firstTaskId: string;
  let secondTaskId: string;

  function authed(token: string) {
    return { Authorization: `Bearer ${token}` };
  }
  function body<T>(res: request.Response): T {
    return res.body as T;
  }
  interface LoginResponse {
    accessToken: string;
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
    const otherLogin = await request(server).post('/api/v1/auth/login').send({ username: 'test_user', password: SEED_PASSWORD }).expect(201);
    otherStoreManagerToken = body<LoginResponse>(otherLogin).accessToken;

    const createdCustomer = await request(server)
      .post('/api/v1/crm/customers')
      .set(authed(adminToken))
      .send({ name: `E2E关怀测试客户-${runTag}`, phone: `138${runTag}`, source: 'ONLINE_AD' })
      .expect(201);
    customerId = body<Customer>(createdCustomer).id;

    const createdMother = await request(server)
      .post('/api/v1/care/mother-profiles')
      .set(authed(adminToken))
      .send({ customerId, deliveryMethod: 'CESAREAN', gestationalWeeks: 39 })
      .expect(201);
    motherProfileId = body<MotherProfile>(createdMother).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. 店长无权限创建关怀模板（总部统一运营标准口径）', async () => {
    await request(server)
      .post('/api/v1/care/outreach-templates')
      .set(authed(storeManagerToken))
      .send({ code: `bad_${runTag}`, name: '不应创建成功', items: [{ dayOffset: 0, title: 'x' }] })
      .expect(403);
  });

  it('2. 超管创建关怀模板：2个节点（离店当天+第7天，占位内容不涉及具体医学随访规则）', async () => {
    const res = await request(server)
      .post('/api/v1/care/outreach-templates')
      .set(authed(adminToken))
      .send({
        code: `outreach_${runTag}`,
        name: `E2E关怀模板-${runTag}`,
        items: [
          { dayOffset: 0, title: '离店当天回访', content: '占位提醒内容，非医学建议' },
          { dayOffset: 7, title: '第7天回访', content: '占位提醒内容，非医学建议' },
        ],
      })
      .expect(201);
    const template = body<CareOutreachTemplate & { items: { id: string; dayOffset: number }[] }>(res);
    expect(template.items).toHaveLength(2);
    templateId = template.id;
  });

  it('3. 店长生成关怀计划：按离店日期+节点偏移正确生成任务排期', async () => {
    const res = await request(server)
      .post('/api/v1/care/outreach-plans')
      .set(authed(storeManagerToken))
      .send({ motherProfileId, templateId, checkedOutAt: '2026-01-01T00:00:00.000Z' })
      .expect(201);
    const plan = body<CareOutreachPlan & { tasks: { id: string; dayOffset: number; scheduledDate: string }[] }>(res);
    expect(plan.status).toBe('ACTIVE');
    expect(plan.tasks).toHaveLength(2);
    planId = plan.id;
    firstTaskId = plan.tasks.find((t) => t.dayOffset === 0)!.id;
    secondTaskId = plan.tasks.find((t) => t.dayOffset === 7)!.id;
    expect(new Date(plan.tasks.find((t) => t.dayOffset === 7)!.scheduledDate).toISOString().slice(0, 10)).toBe('2026-01-08');
  });

  it('4. 待跟进任务列表包含刚生成的两个任务', async () => {
    const res = await request(server).get('/api/v1/care/outreach-plans/pending-tasks').set(authed(storeManagerToken)).expect(200);
    const ids = body<{ id: string }[]>(res).map((t) => t.id);
    expect(ids).toContain(firstTaskId);
    expect(ids).toContain(secondTaskId);
  });

  it('5. 完成第一个任务：计划仍为ACTIVE（还有一个待处理任务）', async () => {
    const res = await request(server)
      .patch(`/api/v1/care/outreach-plans/tasks/${firstTaskId}/complete`)
      .set(authed(storeManagerToken))
      .send({ status: 'COMPLETED', completionNote: '电话回访完成' })
      .expect(200);
    expect(body<{ status: string }>(res).status).toBe('COMPLETED');

    const plan = await request(server).get(`/api/v1/care/outreach-plans/${planId}`).set(authed(storeManagerToken)).expect(200);
    expect(body<CareOutreachPlan>(plan).status).toBe('ACTIVE');
  });

  it('6. 已处理的任务不能重复处理', async () => {
    await request(server)
      .patch(`/api/v1/care/outreach-plans/tasks/${firstTaskId}/complete`)
      .set(authed(storeManagerToken))
      .send({ status: 'COMPLETED' })
      .expect(400);
  });

  it('7. 跳过第二个任务：全部任务处理完毕，计划自动变为COMPLETED', async () => {
    await request(server)
      .patch(`/api/v1/care/outreach-plans/tasks/${secondTaskId}/complete`)
      .set(authed(storeManagerToken))
      .send({ status: 'SKIPPED', completionNote: '客户联系不上' })
      .expect(200);

    const plan = await request(server).get(`/api/v1/care/outreach-plans/${planId}`).set(authed(storeManagerToken)).expect(200);
    expect(body<CareOutreachPlan>(plan).status).toBe('COMPLETED');
  });

  it('8. 终止计划：剩余PENDING任务自动变SKIPPED', async () => {
    const created = await request(server)
      .post('/api/v1/care/outreach-plans')
      .set(authed(storeManagerToken))
      .send({ motherProfileId, templateId, checkedOutAt: '2026-02-01T00:00:00.000Z' })
      .expect(201);
    const newPlan = body<CareOutreachPlan & { version: number }>(created);

    const terminated = await request(server)
      .patch(`/api/v1/care/outreach-plans/${newPlan.id}/terminate`)
      .set(authed(storeManagerToken))
      .send({ reason: '客户不再需要跟进', version: newPlan.version })
      .expect(200);
    const result = body<CareOutreachPlan & { tasks: { status: string }[] }>(terminated);
    expect(result.status).toBe('TERMINATED');
    expect(result.tasks.every((t) => t.status === 'SKIPPED')).toBe(true);
  });

  // ==================== 安全回归：跨门店越权（安全审查发现，已修复） ====================

  it('9. 待跟进任务列表与任务操作不再泄露/可篡改其他门店的客户关怀数据', async () => {
    const created = await request(server)
      .post('/api/v1/care/outreach-plans')
      .set(authed(storeManagerToken))
      .send({ motherProfileId, templateId, checkedOutAt: '2026-03-01T00:00:00.000Z' })
      .expect(201);
    const plan = body<CareOutreachPlan & { tasks: { id: string }[] }>(created);
    const taskId = plan.tasks[0].id;

    // 另一门店(test_user)看不到这条待跟进任务（含客户PII）
    const otherPending = await request(server).get('/api/v1/care/outreach-plans/pending-tasks').set(authed(otherStoreManagerToken)).expect(200);
    expect(body<{ id: string }[]>(otherPending).some((t) => t.id === taskId)).toBe(false);

    // 另一门店(test_user)不能打卡完成这个任务
    await request(server)
      .patch(`/api/v1/care/outreach-plans/tasks/${taskId}/complete`)
      .set(authed(otherStoreManagerToken))
      .send({ status: 'COMPLETED' })
      .expect(403);

    // 另一门店(test_user)也不能终止这个计划
    await request(server)
      .patch(`/api/v1/care/outreach-plans/${plan.id}/terminate`)
      .set(authed(otherStoreManagerToken))
      .send({ reason: '越权尝试', version: plan.version })
      .expect(403);
  });
});
