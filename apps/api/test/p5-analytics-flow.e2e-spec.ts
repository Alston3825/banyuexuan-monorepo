import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import type { AiSuggestion, Contract, Customer, CustomerAccount, Region, Room, RoomOccupancy, Store } from '@prisma/client';
import { AppModule } from '../src/app.module';
import type { FinanceSummary, OccupancySummary } from '../src/analytics/business-report/business-report.service';

/**
 * P5第一片 经营分析看板 端到端集成测试：财务(收款+会员账户)+房态(入住率)聚合，
 * 门店范围用DataScopeService强制收紧（店长限自己门店），以及经营分析Agent
 * （复用P4模型网关，mock global.fetch）。见业务规则确认记录"P5第一片经营分析看板启动前"。
 *
 * 数据库是共享的本地开发库、不做测试隔离：Payment/CustomerAccountTransaction的统计
 * 用"操作前后差值"断言（不假设当日总额只有本测试的数据）；房态入住率用runTag派生的
 * 独占年份区间断言精确值（Room本身不可删除会跨次累积，totalRooms只做弱断言）。
 */
describe('P5 经营分析看板 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;

  const SEED_PASSWORD = 'Passw0rd!23';
  const runTag = Date.now().toString().slice(-8);

  let adminToken: string;
  let storeManagerToken: string;
  let storeId: string;
  let otherStoreId: string;
  let customerId: string;
  let contractId: string;

  function authed(token: string) {
    return { Authorization: `Bearer ${token}` };
  }
  function body<T>(res: request.Response): T {
    return res.body as T;
  }
  interface LoginResponse {
    accessToken: string;
  }
  /** 相对真实"今天"偏移天数，返回 YYYY-MM-DD（UTC）。 */
  function shiftDate(offsetDays: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  }

  function mockGatewaySuccess(content: string) {
    global.fetch = jest.fn(async (url: unknown) => {
      if (String(url).includes('/embeddings/create')) {
        return new Response(
          JSON.stringify({ embeddings: [[0, 0, 0]], provider: 'volcengine', model: 'ep-embed-fake', latency_ms: 5, used_fallback: false }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ content, provider: 'volcengine', model: 'ep-fake', latency_ms: 88, used_fallback: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
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
    storeId = body<Store[]>(stores)[0].id;

    const regions = await request(server).get('/api/v1/platform/regions').set(authed(adminToken)).expect(200);
    let regionId = body<Region[]>(regions)[0]?.id;
    if (!regionId) {
      const createdRegion = await request(server).post('/api/v1/platform/regions').set(authed(adminToken)).send({ code: `E2E-ANALYTICS-${runTag}`, name: 'E2E经营分析测试区域' }).expect(201);
      regionId = body<Region>(createdRegion).id;
    }
    const otherStore = await request(server)
      .post('/api/v1/platform/stores')
      .set(authed(adminToken))
      .send({ code: `E2E-ANALYTICS-${runTag}`, name: 'E2E经营分析测试门店', regionId })
      .expect(201);
    otherStoreId = body<Store>(otherStore).id;

    const customer = await request(server)
      .post('/api/v1/crm/customers')
      .set(authed(adminToken))
      .send({ name: 'E2E经营分析测试客户', phone: `136${runTag}`, source: 'WALK_IN', primaryStoreId: storeId })
      .expect(201);
    customerId = body<Customer>(customer).id;

    const contract = await request(server)
      .post('/api/v1/contract/records')
      .set(authed(adminToken))
      .send({
        customerId,
        storeId,
        title: 'E2E经营分析测试合同',
        content: '仅用于生成收款记录，不测试合同状态机本身',
        amount: 500000,
        startDate: '2027-01-01T00:00:00.000Z',
        endDate: '2027-02-12T00:00:00.000Z',
      })
      .expect(201);
    contractId = body<Contract>(contract).id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ==================== 门店范围权限 ====================

  it('1. 店长查看经营看板：不传storeId自动限定本店，传其他门店会被拒绝', async () => {
    const own = await request(server)
      .get('/api/v1/analytics/finance-summary')
      .set(authed(storeManagerToken))
      .query({ startDate: '2027-01-01', endDate: '2027-01-31' })
      .expect(200);
    expect(body<FinanceSummary>(own).storeScope).toBe(storeId);

    await request(server)
      .get('/api/v1/analytics/finance-summary')
      .set(authed(storeManagerToken))
      .query({ storeId: otherStoreId, startDate: '2027-01-01', endDate: '2027-01-31' })
      .expect(403);
  });

  it('2. 超级管理员不传storeId看全租户汇总，传任意门店都允许', async () => {
    const all = await request(server)
      .get('/api/v1/analytics/finance-summary')
      .set(authed(adminToken))
      .query({ startDate: '2027-01-01', endDate: '2027-01-31' })
      .expect(200);
    expect(body<FinanceSummary>(all).storeScope).toBe('ALL');

    const scoped = await request(server)
      .get('/api/v1/analytics/finance-summary')
      .set(authed(adminToken))
      .query({ storeId: otherStoreId, startDate: '2027-01-01', endDate: '2027-01-31' })
      .expect(200);
    expect(body<FinanceSummary>(scoped).storeScope).toBe(otherStoreId);
  });

  // ==================== 财务：收款 ====================

  it('3. 收款记录计入当日收款总额与按支付方式明细（前后差值断言）', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const before = body<FinanceSummary>(
      await request(server).get('/api/v1/analytics/finance-summary').set(authed(adminToken)).query({ storeId, startDate: today, endDate: today }).expect(200),
    );

    await request(server)
      .post('/api/v1/payment/records')
      .set(authed(adminToken))
      .send({ contractId, customerId, storeId, amount: 123400, method: 'WECHAT' })
      .expect(201);

    const after = body<FinanceSummary>(
      await request(server).get('/api/v1/analytics/finance-summary').set(authed(adminToken)).query({ storeId, startDate: today, endDate: today }).expect(200),
    );
    expect(after.paymentTotalAmount - before.paymentTotalAmount).toBe(123400);

    const wechatBefore = before.paymentByMethod.find((m) => m.method === 'WECHAT')?.amount ?? 0;
    const wechatAfter = after.paymentByMethod.find((m) => m.method === 'WECHAT')?.amount ?? 0;
    expect(wechatAfter - wechatBefore).toBe(123400);
  });

  // ==================== 财务：会员账户 ====================

  it('4. 充值/消费计入当日会员账户流水汇总，当前总余额反映最新状态（前后差值断言）', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const before = body<FinanceSummary>(
      await request(server).get('/api/v1/analytics/finance-summary').set(authed(adminToken)).query({ storeId, startDate: today, endDate: today }).expect(200),
    );

    await request(server)
      .post('/api/v1/finance/customer-accounts/recharge')
      .set(authed(adminToken))
      .send({ customerId, principalAmount: 20000, giftAmount: 5000, remark: 'E2E经营分析测试充值' })
      .expect(201);
    const account = body<CustomerAccount>(
      await request(server).get(`/api/v1/finance/customer-accounts/${customerId}`).set(authed(adminToken)).expect(200),
    );
    await request(server)
      .post('/api/v1/finance/customer-accounts/consume')
      .set(authed(adminToken))
      .send({ customerId, amount: 3000, remark: 'E2E经营分析测试消费', version: account.version })
      .expect(201);

    const after = body<FinanceSummary>(
      await request(server).get('/api/v1/analytics/finance-summary').set(authed(adminToken)).query({ storeId, startDate: today, endDate: today }).expect(200),
    );
    expect(after.accountRechargeAmount - before.accountRechargeAmount).toBe(25000); // 本金+赠送
    expect(after.accountConsumeAmount - before.accountConsumeAmount).toBe(3000);
    expect(after.accountCurrentBalance - before.accountCurrentBalance).toBe(25000 - 3000);
  });

  // ==================== 房态：入住率 ====================

  it('5. 入住占用记录只在实际入住~离店区间内计入当日入住率（前后差值断言）', async () => {
    // actualCheckInAt/actualCheckOutAt 是"操作发生那一刻的真实时间"，不是plannedCheckIn/Out
    // 这两个描述性字段——所以用"昨天/今天/明天"这种相对真实时间的锚点，而不是伪造的未来年份，
    // 才能准确验证"入住当天计入、离店后的日期不再计入"这两条边界。共享开发库里其他测试留下了
    // 大量"已入住未离店"的历史记录，会让绝对值断言不可靠，统一用前后差值断言排除干扰
    // （同财务两项断言的思路一致）。
    const yesterday = shiftDate(-1);
    const today = shiftDate(0);
    const tomorrow = shiftDate(1);

    const yesterdayBefore = body<OccupancySummary>(
      await request(server).get('/api/v1/analytics/occupancy-summary').set(authed(adminToken)).query({ storeId, startDate: yesterday, endDate: yesterday }).expect(200),
    );
    const todayBefore = body<OccupancySummary>(
      await request(server).get('/api/v1/analytics/occupancy-summary').set(authed(adminToken)).query({ storeId, startDate: today, endDate: today }).expect(200),
    );
    const tomorrowBefore = body<OccupancySummary>(
      await request(server).get('/api/v1/analytics/occupancy-summary').set(authed(adminToken)).query({ storeId, startDate: tomorrow, endDate: tomorrow }).expect(200),
    );

    const roomTypes = await request(server).get('/api/v1/room/types').set(authed(adminToken)).expect(200);
    let roomTypeId = body<{ id: string }[]>(roomTypes)[0]?.id;
    if (!roomTypeId) {
      const createdType = await request(server)
        .post('/api/v1/room/types')
        .set(authed(adminToken))
        .send({ code: `E2E-ANALYTICS-${runTag}`, name: 'E2E经营分析测试房型' })
        .expect(201);
      roomTypeId = body<{ id: string }>(createdType).id;
    }
    const room = await request(server)
      .post('/api/v1/room/rooms')
      .set(authed(adminToken))
      .send({ storeId, roomTypeId, roomNo: `ANALYTICS-${runTag}`, floor: '1F' })
      .expect(201);
    const roomId = body<Room>(room).id;

    const occupancy = await request(server)
      .post('/api/v1/room/occupancies')
      .set(authed(adminToken))
      .send({ roomId, storeId, customerId, plannedCheckIn: `${today}T00:00:00.000Z`, plannedCheckOut: `${tomorrow}T00:00:00.000Z` })
      .expect(201);
    const occupancyId = body<RoomOccupancy>(occupancy).id;
    const checkedIn = body<RoomOccupancy>(
      await request(server).post(`/api/v1/room/occupancies/${occupancyId}/check-in`).set(authed(adminToken)).send({ version: 0 }).expect(201),
    );

    const yesterdayAfterCheckIn = body<OccupancySummary>(
      await request(server).get('/api/v1/analytics/occupancy-summary').set(authed(adminToken)).query({ storeId, startDate: yesterday, endDate: yesterday }).expect(200),
    );
    expect(yesterdayAfterCheckIn.daily[0].occupiedRooms - yesterdayBefore.daily[0].occupiedRooms).toBe(0); // 入住前一天不应计入

    const todayAfterCheckIn = body<OccupancySummary>(
      await request(server).get('/api/v1/analytics/occupancy-summary').set(authed(adminToken)).query({ storeId, startDate: today, endDate: today }).expect(200),
    );
    expect(todayAfterCheckIn.totalRooms - todayBefore.totalRooms).toBe(1); // 新建的房间计入总房间数
    expect(todayAfterCheckIn.daily[0].occupiedRooms - todayBefore.daily[0].occupiedRooms).toBe(1); // 入住当天应计入

    await request(server)
      .post(`/api/v1/room/occupancies/${occupancyId}/check-out`)
      .set(authed(adminToken))
      .send({ version: checkedIn.version })
      .expect(201);

    const tomorrowAfterCheckOut = body<OccupancySummary>(
      await request(server).get('/api/v1/analytics/occupancy-summary').set(authed(adminToken)).query({ storeId, startDate: tomorrow, endDate: tomorrow }).expect(200),
    );
    expect(tomorrowAfterCheckOut.daily[0].occupiedRooms - tomorrowBefore.daily[0].occupiedRooms).toBe(0); // 离店后不再计入明天
  });

  // ==================== 经营分析Agent ====================

  it('6. 经营分析Agent：调用模型网关生成解读并留痕AiSuggestion', async () => {
    mockGatewaySuccess('本期收款平稳，入住率处于正常区间，建议持续关注会员账户消费节奏。');
    const today = new Date().toISOString().slice(0, 10);
    const res = await request(server)
      .post('/api/v1/ai/business-analytics-agent/analyze')
      .set(authed(storeManagerToken))
      .send({ startDate: today, endDate: today })
      .expect(201);
    const result = body<{ suggestion: AiSuggestion; financeSummary: FinanceSummary; occupancySummary: OccupancySummary }>(res);
    expect(result.suggestion.scenario).toBe('BUSINESS_ANALYTICS');
    expect(result.suggestion.outputText).toContain('入住率');
    expect(result.financeSummary.storeScope).toBe(storeId); // 店长身份，自动限定本店
  });

  it('7. 经营分析Agent模型网关不可用时返回503，不产生任何写操作以外的副作用', async () => {
    global.fetch = jest.fn(async () => new Response('service down', { status: 503 })) as unknown as typeof fetch;
    const today = new Date().toISOString().slice(0, 10);
    await request(server)
      .post('/api/v1/ai/business-analytics-agent/analyze')
      .set(authed(storeManagerToken))
      .send({ startDate: today, endDate: today })
      .expect(503);
  });
});
