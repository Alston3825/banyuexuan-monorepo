import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import type { UtilityExpense, Vehicle, VehicleBooking } from '@prisma/client';
import { AppModule } from '../src/app.module';

/**
 * P3 后勤管理端到端集成测试：车辆调度（集团层统一调度池+占用冲突检测，见#15）+
 * 水电费登记（门店级运营费用，不做分摊，见#16）。后勤仓库/物料复用已有的
 * Warehouse/InventoryItem(purpose=LOGISTICS)，本测试不重复覆盖（见#14及P3库存域测试）。
 */
describe('P3 后勤管理：车辆调度+水电费登记 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;

  const SEED_PASSWORD = 'Passw0rd!23';
  const runTag = Date.now().toString().slice(-8);

  /** 水电费登记按 storeId+period+expenseType 唯一，用运行时刻派生一个几乎不会跨次冲突的 YYYY-MM。 */
  function derivePeriod(offsetMonths: number): string {
    const totalMonths = Number(runTag) % 96; // 展开到未来约8年内，配合固定 storeId 避免重复跑测试时撞车
    const date = new Date(2030, totalMonths + offsetMonths, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  let adminToken: string;
  let storeManagerToken: string;
  let storeId: string;
  let vehicleId: string;

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

    const stores = await request(server).get('/api/v1/platform/stores').set(authed(adminToken)).expect(200);
    storeId = body<{ id: string }[]>(stores)[0].id;

    const vehicle = await request(server)
      .post('/api/v1/logistics/vehicles')
      .set(authed(adminToken))
      .send({ plateNumber: `京A${runTag}`, model: '别克GL8' })
      .expect(201);
    vehicleId = body<Vehicle>(vehicle).id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ==================== 车辆调度 ====================

  it('1. 车辆主数据：店长无权限新建（总部主数据口径）', async () => {
    await request(server)
      .post('/api/v1/logistics/vehicles')
      .set(authed(storeManagerToken))
      .send({ plateNumber: `京B${runTag}`, model: '丰田考斯特' })
      .expect(403);
  });

  it('2. 结束时间早于开始时间应被拒绝', async () => {
    const res = await request(server)
      .post('/api/v1/logistics/vehicle-bookings')
      .set(authed(storeManagerToken))
      .send({ vehicleId, storeId, purpose: '接送客户', startTime: '2027-05-10T10:00:00.000Z', endTime: '2027-05-10T08:00:00.000Z' })
      .expect(400);
    expect(body<{ message: string }>(res).message).toContain('结束时间必须晚于开始时间');
  });

  it('3. 创建用车申请：同一车辆时段重叠应被拒绝，不重叠的时段可以正常创建', async () => {
    const first = await request(server)
      .post('/api/v1/logistics/vehicle-bookings')
      .set(authed(storeManagerToken))
      .send({ vehicleId, storeId, purpose: '接送客户A', startTime: '2027-05-10T08:00:00.000Z', endTime: '2027-05-10T10:00:00.000Z' })
      .expect(201);
    expect(body<VehicleBooking>(first).status).toBe('BOOKED');

    // 完全重叠
    const conflict1 = await request(server)
      .post('/api/v1/logistics/vehicle-bookings')
      .set(authed(storeManagerToken))
      .send({ vehicleId, storeId, purpose: '接送客户B', startTime: '2027-05-10T08:30:00.000Z', endTime: '2027-05-10T09:30:00.000Z' })
      .expect(400);
    expect(body<{ message: string }>(conflict1).message).toContain('已被占用');

    // 部分重叠（跨越结束边界）
    await request(server)
      .post('/api/v1/logistics/vehicle-bookings')
      .set(authed(storeManagerToken))
      .send({ vehicleId, storeId, purpose: '接送客户C', startTime: '2027-05-10T09:30:00.000Z', endTime: '2027-05-10T11:00:00.000Z' })
      .expect(400);

    // 紧邻但不重叠（10:00开始，等于前一条的结束时间）
    const adjacent = await request(server)
      .post('/api/v1/logistics/vehicle-bookings')
      .set(authed(storeManagerToken))
      .send({ vehicleId, storeId, purpose: '接送客户D', startTime: '2027-05-10T10:00:00.000Z', endTime: '2027-05-10T12:00:00.000Z' })
      .expect(201);
    expect(body<VehicleBooking>(adjacent).status).toBe('BOOKED');
  });

  it('4. 取消用车申请后，原时段可被其他申请重新占用', async () => {
    const created = await request(server)
      .post('/api/v1/logistics/vehicle-bookings')
      .set(authed(storeManagerToken))
      .send({ vehicleId, storeId, purpose: '临时用车', startTime: '2027-06-01T08:00:00.000Z', endTime: '2027-06-01T09:00:00.000Z' })
      .expect(201);
    const id = body<VehicleBooking>(created).id;

    const cancelled = await request(server)
      .post(`/api/v1/logistics/vehicle-bookings/${id}/cancel`)
      .set(authed(storeManagerToken))
      .send({ cancelReason: '计划取消', version: 0 })
      .expect(201);
    expect(body<VehicleBooking>(cancelled).status).toBe('CANCELLED');

    const rebooked = await request(server)
      .post('/api/v1/logistics/vehicle-bookings')
      .set(authed(storeManagerToken))
      .send({ vehicleId, storeId, purpose: '重新占用同一时段', startTime: '2027-06-01T08:00:00.000Z', endTime: '2027-06-01T09:00:00.000Z' })
      .expect(201);
    expect(body<VehicleBooking>(rebooked).status).toBe('BOOKED');
  });

  // ==================== 水电费登记 ====================

  it('5. 创建水电费登记：同门店同月份同类型不可重复创建', async () => {
    const period = derivePeriod(0);
    const created = await request(server)
      .post('/api/v1/logistics/utility-expenses')
      .set(authed(storeManagerToken))
      .send({ storeId, period, expenseType: 'ELECTRICITY', amount: 320000, remark: '电费' })
      .expect(201);
    expect(body<UtilityExpense>(created).amount).toBe(320000);

    const dup = await request(server)
      .post('/api/v1/logistics/utility-expenses')
      .set(authed(storeManagerToken))
      .send({ storeId, period, expenseType: 'ELECTRICITY', amount: 999, remark: '重复登记' })
      .expect(400);
    expect(body<{ message: string }>(dup).message).toContain('已存在登记记录');

    // 不同类型（水费）应可正常创建
    const water = await request(server)
      .post('/api/v1/logistics/utility-expenses')
      .set(authed(storeManagerToken))
      .send({ storeId, period, expenseType: 'WATER', amount: 50000 })
      .expect(201);
    expect(body<UtilityExpense>(water).expenseType).toBe('WATER');
  });

  it('6. 更正水电费金额：乐观锁版本号校验', async () => {
    const created = await request(server)
      .post('/api/v1/logistics/utility-expenses')
      .set(authed(adminToken))
      .send({ storeId, period: derivePeriod(1), expenseType: 'GAS', amount: 10000 })
      .expect(201);
    const id = body<UtilityExpense>(created).id;

    await request(server).patch(`/api/v1/logistics/utility-expenses/${id}`).set(authed(adminToken)).send({ amount: 12000, version: 9 }).expect(409);

    const updated = await request(server).patch(`/api/v1/logistics/utility-expenses/${id}`).set(authed(adminToken)).send({ amount: 12000, version: 0 }).expect(200);
    expect(body<UtilityExpense>(updated).amount).toBe(12000);
  });

  it('7. 权限：店长可以查看车辆列表、创建用车申请与水电费登记（日常操作全部开放）', async () => {
    await request(server).get('/api/v1/logistics/vehicles').set(authed(storeManagerToken)).expect(200);
    await request(server).get('/api/v1/logistics/vehicle-bookings').set(authed(storeManagerToken)).expect(200);
    await request(server).get('/api/v1/logistics/utility-expenses').set(authed(storeManagerToken)).expect(200);
  });
});
