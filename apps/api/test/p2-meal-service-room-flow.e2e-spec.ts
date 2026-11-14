import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import type {
  Customer,
  CustomerServicePackage,
  DinerProfile,
  MealItem,
  MealPlanTemplate,
  MealRecord,
  Room,
  RoomCall,
  RoomOccupancy,
  RoomOuting,
  RoomServiceRequisition,
  ServiceAppointment,
} from '@prisma/client';
import { AppModule } from '../src/app.module';

/**
 * P2 第二批切片端到端集成测试：住店运营细化（呼叫/外出/客房服务领用）+ 月子餐排餐
 * （膳食计划模板生成排期 -> 自选餐窗口/禁忌冲突校验 -> 供餐 -> 评价）+ 产康服务
 * （服务包购买 -> 预约 -> 完成消项 -> 服务包耗尽 -> 评价）。
 *
 * 业务规则依据：docs/竞品分析-一月妈咪月子中心管理系统功能架构逆向分析.md 3.4/3.6 节。
 * 说明：直接连本地开发数据库，不做测试库隔离，风格与 p1-core-flow/p2-care-flow 一致。
 */
describe('P2 月子餐+产康服务+住店运营细化 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;

  const SEED_PASSWORD = 'Passw0rd!23';
  const runTag = Date.now().toString().slice(-8);

  let adminToken: string;
  let storeManagerToken: string;
  let storeId: string;
  let customerId: string;
  let occupancyId: string;

  function authed(token: string) {
    return { Authorization: `Bearer ${token}` };
  }
  function body<T>(res: request.Response): T {
    return res.body as T;
  }
  interface LoginResponse {
    accessToken: string;
  }

  // ---------- 住店运营细化 ----------
  let roomCallId: string;
  let outingId: string;
  let requisitionId: string;

  // ---------- 月子餐 ----------
  let mealItemPlainId: string; // 无禁忌标签，日常默认菜品
  let mealItemEggId: string; // 含"鸡蛋"标签
  let mealItemAltId: string; // 无禁忌标签，用于自选替换
  let restrictionEggId: string;
  let mealPlanTemplateId: string;
  let dinerProfileId: string;
  let pastRecordId: string; // dayOffset=1：过去
  let todayBreakfastRecordId: string; // dayOffset=6：当天早餐
  let futureLunchRecordId: string; // dayOffset=8：未来

  // ---------- 产康服务 ----------
  let productId: string;
  let packageId: string;
  let therapistId: string;
  let customerPackageId: string;
  let appointment1Id: string;
  let appointment4Id: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();

    const adminLogin = await request(server).post('/api/v1/auth/login').send({ username: 'admin', password: SEED_PASSWORD }).expect(201);
    adminToken = body<LoginResponse>(adminLogin).accessToken;

    const storeManagerLogin = await request(server)
      .post('/api/v1/auth/login')
      .send({ username: 'store_manager', password: SEED_PASSWORD })
      .expect(201);
    storeManagerToken = body<LoginResponse>(storeManagerLogin).accessToken;

    const stores = await request(server).get('/api/v1/platform/stores').set(authed(adminToken)).expect(200);
    storeId = body<{ id: string }[]>(stores)[0].id;

    const createdCustomer = await request(server)
      .post('/api/v1/crm/customers')
      .set(authed(adminToken))
      .send({ name: 'E2E月子餐产康测试客户', phone: `137${runTag}`, source: 'ONLINE_AD' })
      .expect(201);
    customerId = body<Customer>(createdCustomer).id;

    const roomTypes = await request(server).get('/api/v1/room/types').set(authed(adminToken)).expect(200);
    let roomTypeId = body<{ id: string }[]>(roomTypes)[0]?.id;
    if (!roomTypeId) {
      const createdType = await request(server)
        .post('/api/v1/room/types')
        .set(authed(adminToken))
        .send({ code: `E2E2-${runTag}`, name: 'E2E 测试房型2' })
        .expect(201);
      roomTypeId = body<{ id: string }>(createdType).id;
    }
    const createdRoom = await request(server)
      .post('/api/v1/room/rooms')
      .set(authed(adminToken))
      .send({ storeId, roomTypeId, roomNo: `E2E2-${runTag}`, floor: '10F' })
      .expect(201);
    const roomId = body<Room>(createdRoom).id;

    const createdOccupancy = await request(server)
      .post('/api/v1/room/occupancies')
      .set(authed(adminToken))
      .send({ roomId, storeId, customerId, plannedCheckIn: '2027-03-01T00:00:00.000Z', plannedCheckOut: '2027-04-12T00:00:00.000Z' })
      .expect(201);
    occupancyId = body<RoomOccupancy>(createdOccupancy).id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ==================== 住店运营细化 ====================

  it('1. 呼叫记录：创建为 PENDING，处理后变为 HANDLED，重复处理应被拒绝', async () => {
    const created = await request(server)
      .post('/api/v1/room/calls')
      .set(authed(adminToken))
      .send({ occupancyId, reason: '需要热水' })
      .expect(201);
    roomCallId = body<RoomCall>(created).id;
    expect(body<RoomCall>(created).status).toBe('PENDING');

    const handled = await request(server).post(`/api/v1/room/calls/${roomCallId}/handle`).set(authed(adminToken)).send({}).expect(201);
    expect(body<RoomCall>(handled).status).toBe('HANDLED');

    await request(server).post(`/api/v1/room/calls/${roomCallId}/handle`).set(authed(adminToken)).send({}).expect(400);
  });

  it('2. 外出管理：PLANNED -> OUT -> RETURNED', async () => {
    const created = await request(server)
      .post('/api/v1/room/outings')
      .set(authed(adminToken))
      .send({ occupancyId, plannedOutAt: '2027-03-05T09:00:00.000Z', plannedBackAt: '2027-03-05T18:00:00.000Z', riskNote: '需家属陪同' })
      .expect(201);
    outingId = body<RoomOuting>(created).id;
    expect(body<RoomOuting>(created).status).toBe('PLANNED');

    const checkedOut = await request(server).post(`/api/v1/room/outings/${outingId}/check-out`).set(authed(adminToken)).send({ version: 0 }).expect(201);
    expect(body<RoomOuting>(checkedOut).status).toBe('OUT');

    const checkedBack = await request(server).post(`/api/v1/room/outings/${outingId}/check-back`).set(authed(adminToken)).send({ version: 1 }).expect(201);
    expect(body<RoomOuting>(checkedBack).status).toBe('RETURNED');
  });

  it('3. 外出管理：错误版本号返回409；PLANNED 状态可直接取消', async () => {
    const created = await request(server)
      .post('/api/v1/room/outings')
      .set(authed(adminToken))
      .send({ occupancyId, plannedOutAt: '2027-03-06T09:00:00.000Z', plannedBackAt: '2027-03-06T18:00:00.000Z' })
      .expect(201);
    const id = body<RoomOuting>(created).id;

    await request(server).post(`/api/v1/room/outings/${id}/check-out`).set(authed(adminToken)).send({ version: 9 }).expect(409);

    const cancelled = await request(server)
      .post(`/api/v1/room/outings/${id}/cancel`)
      .set(authed(adminToken))
      .send({ cancelReason: '客户改变计划', version: 0 })
      .expect(201);
    expect(body<RoomOuting>(cancelled).status).toBe('CANCELLED');
  });

  it('4. 客房服务领用：REQUESTED -> FULFILLED，重复标记完成应被拒绝', async () => {
    const created = await request(server)
      .post('/api/v1/room/service-requisitions')
      .set(authed(adminToken))
      .send({ occupancyId, itemName: '婴儿纸尿裤', quantity: 2 })
      .expect(201);
    requisitionId = body<RoomServiceRequisition>(created).id;
    expect(body<RoomServiceRequisition>(created).status).toBe('REQUESTED');

    const fulfilled = await request(server).post(`/api/v1/room/service-requisitions/${requisitionId}/fulfill`).set(authed(adminToken)).send({}).expect(201);
    expect(body<RoomServiceRequisition>(fulfilled).status).toBe('FULFILLED');

    await request(server).post(`/api/v1/room/service-requisitions/${requisitionId}/fulfill`).set(authed(adminToken)).send({}).expect(400);
  });

  // ==================== 月子餐 ====================

  it('5. 创建菜品与食材类禁忌', async () => {
    const plain = await request(server)
      .post('/api/v1/meal/items')
      .set(authed(adminToken))
      .send({ code: `plain_${runTag}`, name: '清蒸鲈鱼', defaultSlot: 'LUNCH' })
      .expect(201);
    mealItemPlainId = body<MealItem>(plain).id;

    const egg = await request(server)
      .post('/api/v1/meal/items')
      .set(authed(adminToken))
      .send({ code: `egg_${runTag}`, name: '鸡蛋羹', defaultSlot: 'BREAKFAST', ingredientTags: ['鸡蛋'] })
      .expect(201);
    mealItemEggId = body<MealItem>(egg).id;

    const alt = await request(server)
      .post('/api/v1/meal/items')
      .set(authed(adminToken))
      .send({ code: `alt_${runTag}`, name: '小米粥', defaultSlot: 'LUNCH' })
      .expect(201);
    mealItemAltId = body<MealItem>(alt).id;

    const restriction = await request(server)
      .post('/api/v1/meal/dietary-restrictions')
      .set(authed(adminToken))
      .send({ code: `no_egg_${runTag}`, name: '鸡蛋', category: 'INGREDIENT' })
      .expect(201);
    restrictionEggId = body<{ id: string }>(restriction).id;
  });

  it('6. 创建膳食计划模板：排期超出总天数应被拒绝', async () => {
    const res = await request(server)
      .post('/api/v1/meal/plan-templates')
      .set(authed(adminToken))
      .send({
        code: `bad_plan_${runTag}`,
        name: '坏方案',
        planType: 'MONTH_MEAL',
        totalDays: 2,
        items: [{ dayOffset: 5, slot: 'LUNCH', mealItemId: mealItemPlainId }],
      })
      .expect(400);
    expect(body<{ message: string }>(res).message).toContain('超出方案总天数');
  });

  it('7. 创建膳食计划模板：8天方案，第1/6/8天各排一餐', async () => {
    const res = await request(server)
      .post('/api/v1/meal/plan-templates')
      .set(authed(adminToken))
      .send({
        code: `plan_${runTag}`,
        name: '月子餐测试方案(8天)',
        planType: 'MONTH_MEAL',
        totalDays: 8,
        phases: [{ name: '测试阶段', days: 8 }],
        items: [
          { dayOffset: 1, slot: 'LUNCH', mealItemId: mealItemPlainId },
          { dayOffset: 6, slot: 'BREAKFAST', mealItemId: mealItemEggId },
          { dayOffset: 8, slot: 'LUNCH', mealItemId: mealItemPlainId },
        ],
      })
      .expect(201);
    mealPlanTemplateId = body<MealPlanTemplate>(res).id;
  });

  it('8. 建立用膳人：startDate=5天前，绑定"鸡蛋"禁忌，自动生成3条排餐记录', async () => {
    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - 5);
    const startDateStr = startDate.toISOString().slice(0, 10);

    const res = await request(server)
      .post('/api/v1/meal/diner-profiles')
      .set(authed(adminToken))
      .send({ customerId, mealPlanTemplateId, occupancyId, startDate: startDateStr, restrictionIds: [restrictionEggId] })
      .expect(201);
    dinerProfileId = body<DinerProfile>(res).id;
    expect(body<DinerProfile>(res).status).toBe('ACTIVE');

    const records = await request(server).get(`/api/v1/meal/records?dinerProfileId=${dinerProfileId}`).set(authed(adminToken)).expect(200);
    const list = body<MealRecord[]>(records);
    expect(list).toHaveLength(3);
    pastRecordId = list[0].id;
    todayBreakfastRecordId = list[1].id;
    futureLunchRecordId = list[2].id;
    expect(list[1].slot).toBe('BREAKFAST');
    expect(list[2].slot).toBe('LUNCH');
  });

  it('9. 自选餐：已过日期的记录不允许自选', async () => {
    const res = await request(server)
      .post(`/api/v1/meal/records/${pastRecordId}/select`)
      .set(authed(adminToken))
      .send({ mealItemId: mealItemAltId })
      .expect(400);
    expect(body<{ message: string }>(res).message).toContain('已过');
  });

  it('10. 自选餐：早餐当日不可自选', async () => {
    const res = await request(server)
      .post(`/api/v1/meal/records/${todayBreakfastRecordId}/select`)
      .set(authed(adminToken))
      .send({ mealItemId: mealItemAltId })
      .expect(400);
    expect(body<{ message: string }>(res).message).toContain('不可当日自选');
  });

  it('11. 自选餐：选择含"鸡蛋"标签的菜品应因禁忌冲突被拒绝', async () => {
    const res = await request(server)
      .post(`/api/v1/meal/records/${futureLunchRecordId}/select`)
      .set(authed(adminToken))
      .send({ mealItemId: mealItemEggId })
      .expect(400);
    expect(body<{ message: string }>(res).message).toContain('禁忌食材');
  });

  it('12. 自选餐：选择不冲突的菜品应成功，覆盖默认排餐', async () => {
    const res = await request(server)
      .post(`/api/v1/meal/records/${futureLunchRecordId}/select`)
      .set(authed(adminToken))
      .send({ mealItemId: mealItemAltId })
      .expect(201);
    expect(body<MealRecord>(res).isCustomSelected).toBe(true);
    expect(body<MealRecord>(res).selectedMealItemId).toBe(mealItemAltId);
  });

  it('13. 供餐后可评价；未供餐的记录不可评价', async () => {
    const served = await request(server).post(`/api/v1/meal/records/${futureLunchRecordId}/serve`).set(authed(adminToken)).send({}).expect(201);
    expect(body<MealRecord>(served).status).toBe('SERVED');

    const feedback = await request(server)
      .post(`/api/v1/meal/records/${futureLunchRecordId}/feedback`)
      .set(authed(adminToken))
      .send({ rating: 5, comment: '很好吃' })
      .expect(201);
    expect(body<MealRecord>(feedback).rating).toBe(5);

    await request(server).post(`/api/v1/meal/records/${todayBreakfastRecordId}/feedback`).set(authed(adminToken)).send({ rating: 4 }).expect(400);
  });

  it('14. 结束用膳人：ACTIVE -> ENDED，重复结束应被拒绝', async () => {
    const ended = await request(server).post(`/api/v1/meal/diner-profiles/${dinerProfileId}/end`).set(authed(adminToken)).send({}).expect(201);
    expect(body<DinerProfile>(ended).status).toBe('ENDED');

    await request(server).post(`/api/v1/meal/diner-profiles/${dinerProfileId}/end`).set(authed(adminToken)).send({}).expect(400);
  });

  it('15. 权限隔离：店长不可配置菜品（主数据），但可操作用膳人（日常操作）', async () => {
    await request(server)
      .post('/api/v1/meal/items')
      .set(authed(storeManagerToken))
      .send({ code: `sm_${runTag}`, name: 'x', defaultSlot: 'LUNCH' })
      .expect(403);

    await request(server).get('/api/v1/meal/diner-profiles').set(authed(storeManagerToken)).expect(200);
  });

  // ==================== 产康服务 ====================

  it('16. 创建产康项目、服务包（2次）、技师', async () => {
    const product = await request(server)
      .post('/api/v1/service/products')
      .set(authed(adminToken))
      .send({ code: `prod_${runTag}`, name: '产后开背', durationMinutes: 60, unitPrice: 30000 })
      .expect(201);
    productId = body<{ id: string }>(product).id;

    const pkg = await request(server)
      .post('/api/v1/service/packages')
      .set(authed(adminToken))
      .send({ code: `pkg_${runTag}`, name: '开背2次卡', totalSessions: 2, price: 50000 })
      .expect(201);
    packageId = body<{ id: string }>(pkg).id;

    const therapist = await request(server)
      .post('/api/v1/service/therapists')
      .set(authed(adminToken))
      .send({ storeId, name: '王技师' })
      .expect(201);
    therapistId = body<{ id: string }>(therapist).id;
  });

  it('17. 客户购买服务包：剩余次数初始化为总次数', async () => {
    const res = await request(server)
      .post('/api/v1/service/customer-packages')
      .set(authed(adminToken))
      .send({ storeId, customerId, packageId, amount: 50000 })
      .expect(201);
    customerPackageId = body<CustomerServicePackage>(res).id;
    expect(body<CustomerServicePackage>(res).remainingSessions).toBe(2);
    expect(body<CustomerServicePackage>(res).status).toBe('ACTIVE');
  });

  it('18. 预约并完成（第1次）：服务包剩余次数扣减为1，仍为ACTIVE', async () => {
    const created = await request(server)
      .post('/api/v1/service/appointments')
      .set(authed(adminToken))
      .send({ storeId, customerId, productId, therapistId, sourcePackageId: customerPackageId, scheduledAt: '2027-03-10T10:00:00.000Z', durationMinutes: 60 })
      .expect(201);
    appointment1Id = body<ServiceAppointment>(created).id;
    expect(body<ServiceAppointment>(created).status).toBe('BOOKED');

    const completed = await request(server).post(`/api/v1/service/appointments/${appointment1Id}/complete`).set(authed(adminToken)).send({ version: 0 }).expect(201);
    expect(body<ServiceAppointment>(completed).status).toBe('COMPLETED');

    const pkg = await request(server).get(`/api/v1/service/customer-packages/${customerPackageId}`).set(authed(adminToken)).expect(200);
    expect(body<CustomerServicePackage>(pkg).remainingSessions).toBe(1);
    expect(body<CustomerServicePackage>(pkg).status).toBe('ACTIVE');
  });

  it('19. 预约并完成（第2次）：服务包耗尽变为EXHAUSTED，第3次预约应被拒绝', async () => {
    const created = await request(server)
      .post('/api/v1/service/appointments')
      .set(authed(adminToken))
      .send({ storeId, customerId, productId, sourcePackageId: customerPackageId, scheduledAt: '2027-03-11T10:00:00.000Z', durationMinutes: 60 })
      .expect(201);
    const id = body<ServiceAppointment>(created).id;

    const completed = await request(server).post(`/api/v1/service/appointments/${id}/complete`).set(authed(adminToken)).send({ version: 0 }).expect(201);
    expect(body<ServiceAppointment>(completed).status).toBe('COMPLETED');

    const pkg = await request(server).get(`/api/v1/service/customer-packages/${customerPackageId}`).set(authed(adminToken)).expect(200);
    expect(body<CustomerServicePackage>(pkg).remainingSessions).toBe(0);
    expect(body<CustomerServicePackage>(pkg).status).toBe('EXHAUSTED');

    const rejected = await request(server)
      .post('/api/v1/service/appointments')
      .set(authed(adminToken))
      .send({ storeId, customerId, productId, sourcePackageId: customerPackageId, scheduledAt: '2027-03-12T10:00:00.000Z', durationMinutes: 60 })
      .expect(400);
    expect(body<{ message: string }>(rejected).message).toContain('已用完');
  });

  it('20. 散卖预约（不消耗服务包）：可取消、可标记爽约', async () => {
    const created = await request(server)
      .post('/api/v1/service/appointments')
      .set(authed(adminToken))
      .send({ storeId, customerId, productId, scheduledAt: '2027-03-13T10:00:00.000Z', durationMinutes: 60 })
      .expect(201);
    appointment4Id = body<ServiceAppointment>(created).id;

    const noShow = await request(server)
      .post(`/api/v1/service/appointments/${appointment4Id}/cancel`)
      .set(authed(adminToken))
      .send({ cancelReason: '客户未到', noShow: true, version: 0 })
      .expect(201);
    expect(body<ServiceAppointment>(noShow).status).toBe('NO_SHOW');

    await request(server).post(`/api/v1/service/appointments/${appointment4Id}/complete`).set(authed(adminToken)).send({ version: 1 }).expect(400);
  });

  it('21. 评价：已完成的预约可评价，未完成（爽约）的预约不可评价', async () => {
    const feedback = await request(server)
      .post(`/api/v1/service/appointments/${appointment1Id}/feedback`)
      .set(authed(adminToken))
      .send({ rating: 5, comment: '手法很好' })
      .expect(201);
    expect(body<ServiceAppointment>(feedback).rating).toBe(5);

    await request(server).post(`/api/v1/service/appointments/${appointment4Id}/feedback`).set(authed(adminToken)).send({ rating: 3 }).expect(400);
  });

  it('22. 权限隔离：店长不可配置产康项目（主数据），但可操作预约（日常操作）', async () => {
    await request(server)
      .post('/api/v1/service/products')
      .set(authed(storeManagerToken))
      .send({ code: `sm2_${runTag}`, name: 'x' })
      .expect(403);

    await request(server).get('/api/v1/service/appointments').set(authed(storeManagerToken)).expect(200);
  });
});
