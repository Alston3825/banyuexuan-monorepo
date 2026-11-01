import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { nameSimilarity } from '../src/inventory/common/item-similarity';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 采购价格：同一物品不同时间采购价不同，各批次按各自价入账；库存查询看平均价和最近价；价格记录可查每次实际单价 */
describe('P8 采购价格记录 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let prisma: PrismaService;
  let token: string;
  let storeId: string;
  let warehouseId: string;
  const tag = Date.now().toString().slice(-7);
  const authed = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    token = ((await request(server).post('/api/v1/auth/login').send({ username: 'admin', password: 'Passw0rd!23' }).expect(201)).body as Json).accessToken as string;
    storeId = ((await request(server).get('/api/v1/platform/stores').set(authed()).expect(200)).body as Json[]).find((s) => s.name.includes('示例店'))!.id;
    warehouseId = ((await request(server).post('/api/v1/inventory/warehouses').set(authed()).send({ storeId, code: `phwh_${tag}`, name: `价格测试仓库${tag}`, requiresApproval: false }).expect(201)).body as Json).id;
  });
  afterAll(async () => {
    await app.close();
  });

  async function receive(itemId: string, quantity: number, unitCost: number) {
    const r = (await request(server).post('/api/v1/inventory/goods-receipts').set(authed()).send({ storeId, warehouseId, items: [{ itemId, quantity, unitCost }] }).expect(201)).body as Json;
    await request(server).post(`/api/v1/inventory/goods-receipts/${r.id}/submit`).set(authed()).send({ version: 0 }).expect(201);
    await request(server).post(`/api/v1/inventory/goods-receipts/${r.id}/execute`).set(authed()).send({ version: 1 }).expect(201);
    return r;
  }

  it('两次不同单价入库：各批次按各自单价；平均价加权；最近价=第二次；价格记录两条；参考单价跟着最近一次', async () => {
    const item = (await request(server).post('/api/v1/inventory/items').set(authed()).send({ name: `价格物品${tag}`, unit: '个' }).expect(201)).body as Json;
    const r1 = await receive(item.id, 10, 500);
    const r2 = await receive(item.id, 10, 700);

    const batches = (await request(server).get('/api/v1/inventory/stock-batches').query({ itemId: item.id }).set(authed()).expect(200)).body as Json[];
    expect(batches.map((b) => b.unitCost).sort()).toEqual([500, 700]);
    expect(batches.map((b) => b.sourceNo).sort()).toEqual([r1.receiptNo, r2.receiptNo].sort());

    const ov = (await request(server).get('/api/v1/inventory/warehouse-stocks/overview').query({ keyword: `价格物品${tag}` }).set(authed()).expect(200)).body as Json;
    const row = ov.rows.find((x: Json) => x.itemId === item.id);
    expect(row).toMatchObject({ quantity: 20, avgCost: 600, lastCost: 700 });

    const ph = (await request(server).get(`/api/v1/inventory/items/${item.id}/price-history`).set(authed()).expect(200)).body as Json;
    expect(ph.rows.map((x: Json) => x.unitCost)).toEqual([700, 500]);
    expect(ph.rows[0]).toMatchObject({ receiptNo: r2.receiptNo, quantity: 10 });
    expect(ph).toMatchObject({ avgCost: 600, minCost: 500, maxCost: 700 });

    expect(Number((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })).referencePrice)).toBe(7);
  });
});
