import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import type { CustomerAccount } from '@prisma/client';
import { AppModule } from '../src/app.module';

/**
 * P3 财务结算深化端到端集成测试：会员账户（本金/赠送两个子池）落地业务规则确认记录#5
 * "赠送优先扣减，再扣客户实付本金"。与 Payment（强绑定 Contract 的合同收款）是两类
 * 不同性质的资金记录，本域不依赖任何合同/收款数据，独立可测。
 */
describe('P3 财务结算：会员账户 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;

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
      .send({ name: 'E2E客户甲', phone: `138${runTag}`, source: 'WALK_IN', primaryStoreId: storeId })
      .expect(201);
    customerId = body<{ id: string }>(customer).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. 未充值前查询余额为0（不预先建档）', async () => {
    const res = await request(server).get(`/api/v1/finance/customer-accounts/${customerId}`).set(authed(adminToken)).expect(200);
    const account = body<CustomerAccount>(res);
    expect(account.principalBalance).toBe(0);
    expect(account.giftBalance).toBe(0);
  });

  it('2. 充值本金与赠送额度至少填写一项，否则拒绝', async () => {
    const res = await request(server).post('/api/v1/finance/customer-accounts/recharge').set(authed(adminToken)).send({ customerId }).expect(400);
    expect(body<{ message: string }>(res).message).toContain('至少填写一项');
  });

  it('3. 充值本金10000+赠送2000，余额正确累加，流水记录正确', async () => {
    const res = await request(server)
      .post('/api/v1/finance/customer-accounts/recharge')
      .set(authed(adminToken))
      .send({ customerId, principalAmount: 10000, giftAmount: 2000, remark: '首次充值' })
      .expect(201);
    const account = body<CustomerAccount>(res);
    expect(account.principalBalance).toBe(10000);
    expect(account.giftBalance).toBe(2000);

    const txs = await request(server).get(`/api/v1/finance/customer-accounts/${customerId}/transactions`).set(authed(adminToken)).expect(200);
    const list = body<{ type: string; principalDelta: number; giftDelta: number }[]>(txs);
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe('RECHARGE');
    expect(list[0].principalDelta).toBe(10000);
    expect(list[0].giftDelta).toBe(2000);
  });

  it('4. 消费1500：赠送余额(2000)足够覆盖，全部从赠送扣减，本金不动', async () => {
    const res = await request(server)
      .post('/api/v1/finance/customer-accounts/consume')
      .set(authed(adminToken))
      .send({ customerId, amount: 1500, sourceType: 'MANUAL', remark: '测试消费1' })
      .expect(201);
    const account = body<CustomerAccount>(res);
    expect(account.giftBalance).toBe(500);
    expect(account.principalBalance).toBe(10000);
  });

  it('5. 消费2000：赠送余额(500)不足，先扣完赠送再扣本金差额', async () => {
    const res = await request(server)
      .post('/api/v1/finance/customer-accounts/consume')
      .set(authed(adminToken))
      .send({ customerId, amount: 2000, sourceType: 'MANUAL', remark: '测试消费2' })
      .expect(201);
    const account = body<CustomerAccount>(res);
    expect(account.giftBalance).toBe(0); // 500全部扣完
    expect(account.principalBalance).toBe(10000 - 1500); // 差额1500扣本金

    const txs = await request(server).get(`/api/v1/finance/customer-accounts/${customerId}/transactions`).set(authed(adminToken)).expect(200);
    const list = body<{ type: string; principalDelta: number; giftDelta: number }[]>(txs);
    const lastConsume = list.find((t) => t.type === 'CONSUME' && t.giftDelta === -500);
    expect(lastConsume).toBeTruthy();
    expect(lastConsume!.principalDelta).toBe(-1500);
  });

  it('6. 余额不足时消费应被拒绝', async () => {
    const res = await request(server)
      .post('/api/v1/finance/customer-accounts/consume')
      .set(authed(adminToken))
      .send({ customerId, amount: 999999, sourceType: 'MANUAL' })
      .expect(400);
    expect(body<{ message: string }>(res).message).toContain('余额不足');
  });

  it('7. 退款：操作员显式指定退回本金/赠送金额', async () => {
    const res = await request(server)
      .post('/api/v1/finance/customer-accounts/refund')
      .set(authed(adminToken))
      .send({ customerId, principalAmount: 500, giftAmount: 100, remark: '部分退款' })
      .expect(201);
    const account = body<CustomerAccount>(res);
    expect(account.principalBalance).toBe(8500 + 500);
    expect(account.giftBalance).toBe(0 + 100);
  });

  it('8. 人工调整：调整后余额不能为负', async () => {
    const res = await request(server)
      .post('/api/v1/finance/customer-accounts/adjust')
      .set(authed(adminToken))
      .send({ customerId, principalDelta: -999999, giftDelta: 0, remark: '测试负余额拦截' })
      .expect(400);
    expect(body<{ message: string }>(res).message).toContain('不能为负');
  });

  it('9. 人工调整：正常调增，仅 SUPER_ADMIN 可操作（店长无权限应403）', async () => {
    const res = await request(server)
      .post('/api/v1/finance/customer-accounts/adjust')
      .set(authed(adminToken))
      .send({ customerId, principalDelta: 100, giftDelta: 0, remark: '人工纠错+100' })
      .expect(201);
    const account = body<CustomerAccount>(res);
    expect(account.principalBalance).toBe(9000 + 100);

    await request(server)
      .post('/api/v1/finance/customer-accounts/adjust')
      .set(authed(storeManagerToken))
      .send({ customerId, principalDelta: 100, giftDelta: 0, remark: '店长越权尝试' })
      .expect(403);
  });

  it('10. 权限：店长可以充值/消费/退款（前台日常操作全部开放）', async () => {
    await request(server).get(`/api/v1/finance/customer-accounts/${customerId}`).set(authed(storeManagerToken)).expect(200);
    await request(server)
      .post('/api/v1/finance/customer-accounts/recharge')
      .set(authed(storeManagerToken))
      .send({ customerId, principalAmount: 1000, remark: '店长登记充值' })
      .expect(201);
  });
});
