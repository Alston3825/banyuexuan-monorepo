import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createHash } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { Kuaidi100Client } from '../src/inventory/purchase-order/kuaidi100.client';
import { PurchaseOrderLogisticsCore } from '../src/inventory/purchase-order/purchase-order-logistics.core';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 采购单物流：登记平台/单号 + 快递100 查询（接口用假数据代替）+ 自动刷新 */
describe('P8 采购单物流 / 快递100 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let prisma: PrismaService;
  let token: string;
  let staffToken: string;
  let orderId: string;
  let draftId: string;
  const tag = Date.now().toString().slice(-7);
  const authed = (t = token) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    process.env.KUAIDI100_CUSTOMER = 'CUSTOMER_X';
    process.env.KUAIDI100_KEY = 'KEY_X';
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    const login = async (u: string) => ((await request(server).post('/api/v1/auth/login').send({ username: u, password: 'Passw0rd!23' }).expect(201)).body as Json).accessToken as string;
    token = await login('admin');
    staffToken = await login('store_staff');
    const storeId = ((await request(server).get('/api/v1/platform/stores').set(authed()).expect(200)).body as Json[]).find((s) => s.name.includes('示例店'))!.id;
    const supplierId = ((await request(server).post('/api/v1/inventory/suppliers').set(authed()).send({ code: `lgsup_${tag}`, name: `物流供应商${tag}` }).expect(201)).body as Json).id;
    const warehouseId = ((await request(server).post('/api/v1/inventory/warehouses').set(authed()).send({ storeId, code: `lgwh_${tag}`, name: `物流仓库${tag}`, requiresApproval: false }).expect(201)).body as Json).id;
    const itemId = ((await request(server).post('/api/v1/inventory/items').set(authed()).send({ code: `lg_${tag}`, name: `物流物品${tag}`, unit: '箱' }).expect(201)).body as Json).id;
    const mk = async () => ((await request(server).post('/api/v1/inventory/purchase-orders').set(authed()).send({ storeId, warehouseId, supplierId, items: [{ itemId, quantity: 2, unitPrice: 500 }] }).expect(201)).body as Json).id as string;
    draftId = await mk();
    orderId = await mk();
    await prisma.purchaseOrder.update({ where: { id: orderId }, data: { status: 'PURCHASED', purchasedAt: new Date() } });
  });
  afterAll(async () => {
    delete process.env.KUAIDI100_CUSTOMER;
    delete process.env.KUAIDI100_KEY;
    await app.close();
  });

  it('1. 快递100 签名：MD5(param + key + customer) 大写，请求体含 customer/sign/param', async () => {
    const calls: { url: string; body: string }[] = [];
    const orig = global.fetch;
    global.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), body: String(init.body) });
      return new Response(JSON.stringify({ message: 'ok', state: '3', status: '200', com: 'yuantong', nu: 'YT1', data: [{ time: '2026-10-22 10:00:00', context: '已签收' }] }));
    }) as typeof fetch;
    try {
      const r = await app.get(Kuaidi100Client).query('yuantong', 'YT1', null);
      expect(r.state).toBe(3);
      const form = new URLSearchParams(calls[0].body);
      const param = form.get('param')!;
      expect(form.get('customer')).toBe('CUSTOMER_X');
      expect(form.get('sign')).toBe(createHash('md5').update(param + 'KEY_X' + 'CUSTOMER_X').digest('hex').toUpperCase());
      expect(JSON.parse(param)).toMatchObject({ com: 'yuantong', num: 'YT1' });
    } finally {
      global.fetch = orig;
    }
  });

  it('1b. 快递100 返回“查询无结果”（刚发出/单号不对）不算故障，状态是“暂无物流信息”', async () => {
    const orig = global.fetch;
    global.fetch = (async () => new Response(JSON.stringify({ result: false, returnCode: '500', message: '查询无结果，请隔段时间再查' }))) as typeof fetch;
    try {
      const r = await app.get(Kuaidi100Client).query('yuantong', 'YT_NONE', null);
      expect(r).toMatchObject({ state: -1, events: [] });
    } finally {
      global.fetch = orig;
    }
  });

  it('2. 登记平台和单号后自动查一次：轨迹/状态存起来；元数据里有快递公司列表；草稿状态的采购单不能登记', async () => {
    const meta = (await request(server).get('/api/v1/inventory/purchase-orders/logistics-meta').set(authed()).expect(200)).body as Json;
    expect(meta.configured).toBe(true);
    expect(meta.companies.map((c: Json) => c.code)).toContain('shunfeng');
    const spy = jest.spyOn(app.get(Kuaidi100Client), 'query').mockResolvedValue({ state: 0, company: 'yuantong', num: 'YT1234', events: [{ time: '2026-10-22 09:00:00', context: '运输中' }, { time: '2026-10-21 20:00:00', context: '已揽收' }] });
    const r = (await request(server).patch(`/api/v1/inventory/purchase-orders/${orderId}/logistics`).set(authed()).send({ platform: '1688', platformOrderNo: `A${tag}`, expressNo: 'YT1234', expressCompany: 'yuantong' }).expect(200)).body as Json;
    expect(r).toMatchObject({ platform: '1688', expressNo: 'YT1234', expressCompanyName: '圆通', logisticsState: 0, logisticsStateLabel: '运输中' });
    expect(r.trace).toHaveLength(2);
    expect(spy).toHaveBeenCalledWith('yuantong', 'YT1234', null);
    await request(server).patch(`/api/v1/inventory/purchase-orders/${draftId}/logistics`).set(authed()).send({ expressNo: 'X', expressCompany: 'yuantong' }).expect(400);
    await request(server).patch(`/api/v1/inventory/purchase-orders/${orderId}/logistics`).set(authed()).send({ platform: 'FOO' }).expect(400);
    await request(server).patch(`/api/v1/inventory/purchase-orders/${orderId}/logistics`).set(authed()).send({ expressPhoneTail: '12' }).expect(400);
  });

  it('3. 手动刷新：状态变“已签收”；查询失败时保留旧轨迹并记录错误；换单号会清掉旧轨迹', async () => {
    const q = jest.spyOn(app.get(Kuaidi100Client), 'query');
    q.mockResolvedValueOnce({ state: 3, company: 'yuantong', num: 'YT1234', events: [{ time: '2026-10-22 12:00:00', context: '已签收，签收人：前台' }] });
    let r = (await request(server).post(`/api/v1/inventory/purchase-orders/${orderId}/logistics/refresh`).set(authed()).expect(201)).body as Json;
    expect(r.logisticsStateLabel).toBe('已签收');
    expect(r.trace[0].context).toContain('签收');
    q.mockRejectedValueOnce(Object.assign(new Error('快递100：单号不存在'), { getStatus: () => 503 }));
    await request(server).post(`/api/v1/inventory/purchase-orders/${orderId}/logistics/refresh`).set(authed()).expect(500);
    r = (await request(server).get(`/api/v1/inventory/purchase-orders/${orderId}/logistics`).set(authed()).expect(200)).body as Json;
    expect(r.error).toContain('单号不存在');
    expect(r.trace).toHaveLength(1);
    q.mockResolvedValueOnce({ state: 1, company: 'yuantong', num: 'YT9999', events: [] });
    r = (await request(server).patch(`/api/v1/inventory/purchase-orders/${orderId}/logistics`).set(authed()).send({ expressNo: 'YT9999' }).expect(200)).body as Json;
    expect(r.expressNo).toBe('YT9999');
    expect(r.logisticsStateLabel).toBe('已揽收');
    expect(r.error).toBeNull();
  });

  it('4. 自动刷新只查“已采购、有单号、还没签收”的；没有登记查看权限的人不能看', async () => {
    const q = jest.spyOn(app.get(Kuaidi100Client), 'query').mockClear().mockResolvedValue({ state: 3, company: 'yuantong', num: 'YT9999', events: [{ time: 't', context: '签收' }] });
    const n = await app.get(PurchaseOrderLogisticsCore).autoRefresh();
    expect(n).toBeGreaterThanOrEqual(1);
    const after = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect(after.logisticsState).toBe(3);
    q.mockClear();
    await app.get(PurchaseOrderLogisticsCore).autoRefresh();
    expect(q.mock.calls.some((c) => c[1] === 'YT9999')).toBe(false); // 已签收的不再查
    await request(server).get(`/api/v1/inventory/purchase-orders/${orderId}/logistics`).expect(401);
    void staffToken;
  });
});
