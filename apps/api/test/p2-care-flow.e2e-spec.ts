import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import type {
  BabyProfile,
  CareAbnormality,
  CareFieldDefinition,
  CareFormTemplate,
  CarePlan,
  CarePlanTemplate,
  CareRecord,
  Customer,
  MotherProfile,
  Tag,
} from '@prisma/client';
import { AppModule } from '../src/app.module';

/**
 * P2 母婴履约深化 —— 护理域第一个切片端到端集成测试：护理字段/护理项目/护理方案
 * （四层表单引擎）-> 妈妈/宝宝档案（含多胞胎、风险标签）-> 护理计划生成每日任务卡片
 * -> 护理记录提交（含补录/更正）-> 提交时自动判定护理异常 -> 异常跟进/处理闭环。
 *
 * 对应《软件项目开发计划》P2 退出标准中与本切片相关的部分：
 *   1) 护理计划可生成、执行可记录、异常可闭环；
 *   2) 表单引擎的 targetType 一致性、乐观锁并发控制、权限隔离均需验证。
 *
 * 业务规则依据：docs/业务规则确认记录.md #6（多胞胎/再次入住建模）、#7（异常单档判定/
 * 本期不做医嘱/补录与更正留痕规则）。
 *
 * 说明：直接连本地开发数据库，不做测试库隔离，风格与 p1-core-flow.e2e-spec.ts 一致。
 */
describe('P2 护理域：表单引擎+档案+计划+执行+异常 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;

  const SEED_PASSWORD = 'Passw0rd!23';
  const runTag = Date.now().toString().slice(-8);

  let adminToken: string;
  let storeManagerToken: string;
  let customerId: string;
  let tagId: string;

  let temperatureFieldId: string;
  let lochiaFieldId: string;
  let babyFeedingFieldId: string;
  let formTemplateId: string;
  let planTemplateId: string;
  let motherProfileId: string;
  let babyProfileAId: string;
  let carePlanId: string;
  let task1Id: string;
  let task2Id: string;
  let originalRecordId: string;
  let abnormalityId: string;
  let abnormalityVersion: number;

  function authed(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  function body<T>(res: request.Response): T {
    return res.body as T;
  }

  interface LoginResponse {
    accessToken: string;
    refreshToken: string;
    account: { id: string; username: string; realName: string };
  }

  interface CreateCareRecordResponse {
    record: CareRecord;
    abnormalities: CareAbnormality[];
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();

    const adminLogin = await request(server)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: SEED_PASSWORD })
      .expect(201);
    adminToken = body<LoginResponse>(adminLogin).accessToken;

    const storeManagerLogin = await request(server)
      .post('/api/v1/auth/login')
      .send({ username: 'store_manager', password: SEED_PASSWORD })
      .expect(201);
    storeManagerToken = body<LoginResponse>(storeManagerLogin).accessToken;

    // 复用/新建一个客户作为"妈妈档案"的挂靠对象——本切片不测试 CRM 建档链路本身。
    const customers = await request(server).get('/api/v1/crm/customers').set(authed(adminToken)).expect(200);
    const existingCustomer = body<Customer[]>(customers)[0];
    if (existingCustomer) {
      customerId = existingCustomer.id;
    } else {
      const createdCustomer = await request(server)
        .post('/api/v1/crm/customers')
        .set(authed(adminToken))
        .send({ name: 'E2E护理测试客户', phone: `139${runTag}`, source: 'ONLINE_AD' })
        .expect(201);
      customerId = body<Customer>(createdCustomer).id;
    }

    const createdTag = await request(server)
      .post('/api/v1/platform/tags')
      .set(authed(adminToken))
      .send({ name: `E2E风险标签-${runTag}`, category: 'CARE_RISK' })
      .expect(201);
    tagId = body<Tag>(createdTag).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. 创建护理字段：体温（NUMBER，正常值域36-37.5）', async () => {
    const res = await request(server)
      .post('/api/v1/care/fields')
      .set(authed(adminToken))
      .send({
        code: `mother_temperature_${runTag}`,
        name: '体温',
        targetType: 'MOTHER',
        controlType: 'NUMBER',
        unit: '℃',
        normalMin: 36,
        normalMax: 37.5,
      })
      .expect(201);
    temperatureFieldId = body<CareFieldDefinition>(res).id;
    expect(body<CareFieldDefinition>(res).status).toBe('ACTIVE');
  });

  it('2. 创建护理字段：恶露情况（SELECT，正常值=normal）', async () => {
    const res = await request(server)
      .post('/api/v1/care/fields')
      .set(authed(adminToken))
      .send({
        code: `mother_lochia_${runTag}`,
        name: '恶露情况',
        targetType: 'MOTHER',
        controlType: 'SELECT',
        options: [
          { value: 'normal', label: '正常' },
          { value: 'abnormal_odor', label: '异味' },
        ],
        normalOptionValues: ['normal'],
      })
      .expect(201);
    lochiaFieldId = body<CareFieldDefinition>(res).id;
  });

  it('3. 创建护理字段：喂奶量（BABY 适用对象，用于验证跨对象校验）', async () => {
    const res = await request(server)
      .post('/api/v1/care/fields')
      .set(authed(adminToken))
      .send({ code: `baby_feeding_ml_${runTag}`, name: '喂奶量', targetType: 'BABY', controlType: 'NUMBER', unit: 'ml' })
      .expect(201);
    babyFeedingFieldId = body<CareFieldDefinition>(res).id;
  });

  it('4. 创建护理项目（表单模板）：把 BABY 字段挂到 MOTHER 表单应被拒绝', async () => {
    const res = await request(server)
      .post('/api/v1/care/form-templates')
      .set(authed(adminToken))
      .send({
        code: `mother_daily_bad_${runTag}`,
        name: '混用测试',
        targetType: 'MOTHER',
        department: 'NURSING',
        fields: [{ fieldId: temperatureFieldId }, { fieldId: babyFeedingFieldId }],
      })
      .expect(400);
    expect(body<{ message: string }>(res).message).toContain('适用对象');
  });

  it('5. 创建护理项目（表单模板）：妈妈日常护理-通用，字段组合正确', async () => {
    const res = await request(server)
      .post('/api/v1/care/form-templates')
      .set(authed(adminToken))
      .send({
        code: `mother_daily_general_${runTag}`,
        name: '妈妈日常护理-通用',
        targetType: 'MOTHER',
        department: 'NURSING',
        scene: 'GENERAL',
        fields: [
          { fieldId: temperatureFieldId, required: true, sortOrder: 1 },
          { fieldId: lochiaFieldId, required: false, sortOrder: 2 },
        ],
      })
      .expect(201);
    formTemplateId = body<CareFormTemplate>(res).id;
    expect(body<CareFormTemplate & { fields: unknown[] }>(res).fields).toHaveLength(2);
  });

  it('6. 创建护理方案：排期天数超过总天数应被拒绝', async () => {
    const res = await request(server)
      .post('/api/v1/care/plan-templates')
      .set(authed(adminToken))
      .send({
        code: `mother_bad_plan_${runTag}`,
        name: '坏方案',
        targetType: 'MOTHER',
        totalDays: 2,
        items: [{ dayOffset: 5, formTemplateId }],
      })
      .expect(400);
    expect(body<{ message: string }>(res).message).toContain('超出方案总天数');
  });

  it('7. 创建护理方案：妈妈护理入住方案（2天，每天都排该表单）', async () => {
    const res = await request(server)
      .post('/api/v1/care/plan-templates')
      .set(authed(adminToken))
      .send({
        code: `mother_2d_${runTag}`,
        name: '妈妈护理入住方案(测试用2天)',
        targetType: 'MOTHER',
        totalDays: 2,
        items: [
          { dayOffset: 1, formTemplateId },
          { dayOffset: 2, formTemplateId },
        ],
      })
      .expect(201);
    planTemplateId = body<CarePlanTemplate>(res).id;
  });

  it('8. 建立妈妈档案：随档同时创建双胞胎宝宝档案+风险标签', async () => {
    const res = await request(server)
      .post('/api/v1/care/mother-profiles')
      .set(authed(adminToken))
      .send({
        customerId,
        deliveryMethod: 'CESAREAN',
        gestationalWeeks: 39,
        riskTagIds: [tagId],
        babies: [
          { name: '宝宝A', gender: 'MALE', birthWeightGrams: 3200, riskTagIds: [tagId] },
          { name: '宝宝B', gender: 'FEMALE', birthWeightGrams: 3000 },
        ],
      })
      .expect(201);
    const mother = body<MotherProfile & { babies: BabyProfile[] }>(res);
    motherProfileId = mother.id;
    expect(mother.babies).toHaveLength(2);
    expect(mother.babies[0].sequenceNo).toBe(1);
    expect(mother.babies[1].sequenceNo).toBe(2);
    babyProfileAId = mother.babies[0].id;
  });

  it('9. 妈妈档案的风险标签绑定可查询', async () => {
    const res = await request(server)
      .get(`/api/v1/care/mother-profiles/${motherProfileId}/risk-tags`)
      .set(authed(adminToken))
      .expect(200);
    const bindings = body<{ tagId: string; entityType: string }[]>(res);
    expect(bindings).toHaveLength(1);
    expect(bindings[0].tagId).toBe(tagId);
    expect(bindings[0].entityType).toBe('MOTHER_PROFILE');
  });

  it('10. 补建第三条宝宝档案：sequenceNo 自动递增为3', async () => {
    const res = await request(server)
      .post('/api/v1/care/baby-profiles')
      .set(authed(adminToken))
      .send({ motherProfileId, name: '宝宝C', gender: 'MALE' })
      .expect(201);
    expect(body<BabyProfile>(res).sequenceNo).toBe(3);
  });

  it('11. 生成护理计划：按方案批量生成每日任务卡片', async () => {
    const res = await request(server)
      .post('/api/v1/care/plans')
      .set(authed(adminToken))
      .send({ motherProfileId, planTemplateId, startDate: '2026-07-28' })
      .expect(201);
    const plan = body<CarePlan & { tasks: { id: string; dayOffset: number; status: string }[] }>(res);
    carePlanId = plan.id;
    expect(plan.status).toBe('ACTIVE');
    expect(plan.tasks).toHaveLength(2);
    task1Id = plan.tasks[0].id;
    task2Id = plan.tasks[1].id;
    expect(plan.tasks[0].status).toBe('PENDING');
  });

  it('12. 生成护理计划：motherProfileId 与 babyProfileId 都不传应被拒绝', async () => {
    await request(server)
      .post('/api/v1/care/plans')
      .set(authed(adminToken))
      .send({ planTemplateId, startDate: '2026-07-28' })
      .expect(400);
  });

  it('13. 提交护理记录缺必填字段应被拒绝', async () => {
    const res = await request(server)
      .post('/api/v1/care/records')
      .set(authed(adminToken))
      .send({
        formTemplateId,
        motherProfileId,
        occurredAt: '2026-07-28T08:00:00Z',
        values: {},
      })
      .expect(400);
    expect(body<{ message: string }>(res).message).toContain('必填');
  });

  it('14. 提交护理记录：体温38.5（超出正常值域）应自动生成护理异常，关联任务卡片变为已完成', async () => {
    const res = await request(server)
      .post('/api/v1/care/records')
      .set(authed(adminToken))
      .send({
        formTemplateId,
        motherProfileId,
        occurredAt: '2026-07-28T08:00:00Z',
        values: { [`mother_temperature_${runTag}`]: 38.5, [`mother_lochia_${runTag}`]: 'normal' },
        carePlanTaskId: task1Id,
      })
      .expect(201);
    const result = body<CreateCareRecordResponse>(res);
    originalRecordId = result.record.id;
    expect(result.abnormalities).toHaveLength(1);
    abnormalityId = result.abnormalities[0].id;
    abnormalityVersion = result.abnormalities[0].version;
    expect(result.abnormalities[0].status).toBe('OPEN');

    const plan = await request(server).get(`/api/v1/care/plans/${carePlanId}`).set(authed(adminToken)).expect(200);
    const tasks = body<{ tasks: { id: string; status: string; careRecordId: string | null }[] }>(plan).tasks;
    const completedTask = tasks.find((t) => t.id === task1Id)!;
    expect(completedTask.status).toBe('COMPLETED');
    expect(completedTask.careRecordId).toBe(originalRecordId);
  });

  it('15. 已完成任务卡片不允许重复提交', async () => {
    const res = await request(server)
      .post('/api/v1/care/records')
      .set(authed(adminToken))
      .send({
        formTemplateId,
        motherProfileId,
        occurredAt: '2026-07-28T09:00:00Z',
        values: { [`mother_temperature_${runTag}`]: 36.8 },
        carePlanTaskId: task1Id,
      })
      .expect(400);
    expect(body<{ message: string }>(res).message).toContain('更正接口');
  });

  it('16. 跟进护理异常：状态从 OPEN 推进为 FOLLOWING', async () => {
    await request(server)
      .post(`/api/v1/care/abnormalities/${abnormalityId}/follow-ups`)
      .set(authed(adminToken))
      .send({ type: 'ON_SITE_VISIT', content: '已通知护理师复测体温' })
      .expect(201);

    const res = await request(server).get(`/api/v1/care/abnormalities/${abnormalityId}`).set(authed(adminToken)).expect(200);
    expect(body<CareAbnormality>(res).status).toBe('FOLLOWING');
    abnormalityVersion = body<CareAbnormality>(res).version;
  });

  it('17. 更正原记录：体温改为36.8，原记录保留不变，新记录不再触发异常', async () => {
    const res = await request(server)
      .post('/api/v1/care/records')
      .set(authed(adminToken))
      .send({
        formTemplateId,
        motherProfileId,
        occurredAt: '2026-07-28T08:00:00Z',
        values: { [`mother_temperature_${runTag}`]: 36.8, [`mother_lochia_${runTag}`]: 'normal' },
        correctionOfId: originalRecordId,
      })
      .expect(201);
    const result = body<CreateCareRecordResponse>(res);
    expect(result.record.correctionOfId).toBe(originalRecordId);
    expect(result.abnormalities).toHaveLength(0);

    const original = await request(server).get(`/api/v1/care/records/${originalRecordId}`).set(authed(adminToken)).expect(200);
    const originalBody = body<CareRecord & { values: Record<string, unknown> }>(original);
    expect(originalBody.values[`mother_temperature_${runTag}`]).toBe(38.5);
  });

  it('18. 用错误版本号解决护理异常应返回 409', async () => {
    await request(server)
      .post(`/api/v1/care/abnormalities/${abnormalityId}/resolve`)
      .set(authed(adminToken))
      .send({ resolveNote: '复测正常', version: 0 })
      .expect(409);
  });

  it('19. 用正确版本号解决护理异常：状态变为 RESOLVED', async () => {
    const res = await request(server)
      .post(`/api/v1/care/abnormalities/${abnormalityId}/resolve`)
      .set(authed(adminToken))
      .send({ resolveNote: '复测36.8，恢复正常', version: abnormalityVersion })
      .expect(201);
    expect(body<CareAbnormality>(res).status).toBe('RESOLVED');
  });

  it('20. 补录记录不填补录原因应被拒绝，填了原因应成功', async () => {
    await request(server)
      .post('/api/v1/care/records')
      .set(authed(adminToken))
      .send({
        formTemplateId,
        motherProfileId,
        occurredAt: '2026-07-27T20:00:00Z',
        values: { [`mother_temperature_${runTag}`]: 36.5 },
        isBackfilled: true,
      })
      .expect(400);

    const res = await request(server)
      .post('/api/v1/care/records')
      .set(authed(adminToken))
      .send({
        formTemplateId,
        motherProfileId,
        occurredAt: '2026-07-27T20:00:00Z',
        values: { [`mother_temperature_${runTag}`]: 36.5 },
        isBackfilled: true,
        backfillReason: '当晚护理师漏记，次日补录',
      })
      .expect(201);
    expect(body<CreateCareRecordResponse>(res).record.isBackfilled).toBe(true);
  });

  it('21. 终止护理计划：剩余待办任务卡片变为 MISSED，终止后不可重复终止', async () => {
    const plan = await request(server).get(`/api/v1/care/plans/${carePlanId}`).set(authed(adminToken)).expect(200);
    const version = body<CarePlan>(plan).version;

    const res = await request(server)
      .post(`/api/v1/care/plans/${carePlanId}/terminate`)
      .set(authed(adminToken))
      .send({ reason: '客户提前离店', version })
      .expect(201);
    const terminated = body<CarePlan & { tasks: { id: string; status: string }[] }>(res);
    expect(terminated.status).toBe('TERMINATED');
    const task2 = terminated.tasks.find((t) => t.id === task2Id)!;
    expect(task2.status).toBe('MISSED');

    await request(server)
      .post(`/api/v1/care/plans/${carePlanId}/terminate`)
      .set(authed(adminToken))
      .send({ reason: '再次终止', version: terminated.version })
      .expect(400);
  });

  it('22. 权限隔离：店长账号不可配置护理字段（主数据），但可操作母婴档案（日常操作）', async () => {
    await request(server)
      .post('/api/v1/care/fields')
      .set(authed(storeManagerToken))
      .send({ code: `sm_test_${runTag}`, name: 'x', targetType: 'MOTHER', controlType: 'TEXT' })
      .expect(403);

    await request(server).get('/api/v1/care/mother-profiles').set(authed(storeManagerToken)).expect(200);
  });

  it('23. 按 motherProfileId 查询宝宝档案列表：能查到建档时随档创建的宝宝A', async () => {
    const res = await request(server)
      .get(`/api/v1/care/baby-profiles?motherProfileId=${motherProfileId}`)
      .set(authed(adminToken))
      .expect(200);
    const babies = body<BabyProfile[]>(res);
    expect(babies).toHaveLength(3); // 随档2条 + 补建1条
    expect(babies.some((b) => b.id === babyProfileAId && b.name === '宝宝A')).toBe(true);
  });
});
