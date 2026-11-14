import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 库存查询默认视图：每种物品一行（没入过库=0），预警（缺货/低库存）排前面，带汇总，可搜索/筛选。 */
describe('P8 库存总览 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let prisma: PrismaService;
  let token: string;
  let warehouseId: string;
  const tag = Date.now().toString().slice(-7);
  const authed = () => ({ Authorization: `Bearer ${token}` });
  const get = async (q: Json = {}) => (await request(server).get('/api/v1/inventory/warehouse-stocks/overview').query(q).set(authed()).expect(200)).body as Json;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    token = ((await request(server).post('/api/v1/auth/login').send({ username: 'admin', password: 'Passw0rd!23' }).expect(201)).body as Json).accessToken;
    const store = ((await request(server).get('/api/v1/platform/stores').set(authed()).expect(200)).body as Json[]).find((s) => s.name.includes('示例店'))!;
    warehouseId = ((await request(server).post('/api/v1/inventory/warehouses').set(authed()).send({ storeId: store.id, code: `ovwh_${tag}`, name: `总览仓库${tag}`, requiresApproval: false }).expect(201)).body as Json).id;
    const mk = async (key: string, threshold: number | undefined, qty: number) => {
      const it = (await request(server).post('/api/v1/inventory/items').set(authed()).send({ code: `ov_${key}_${tag}`, name: `总览物品${key}${tag}`, unit: '个', safetyStockThreshold: threshold }).expect(201)).body as Json;
      ids[key] = it.id;
      if (qty > 0) await prisma.warehouseStock.create({ data: { warehouseId, itemId: it.id, quantity: qty, avgCost: 200 } });
    };
    await mk('OUT', 5, 0); // 设了预警线、没入过库 → 缺货
    await mk('LOW', 10, 3); // 低于预警线
    await mk('OK', 10, 20); // 正常
    await mk('NONE', undefined, 7); // 没设预警线，有库存
  });

  afterAll(async () => {
    await app.close();
  });

  it('默认全部物品都在：没入过库的显示 0；预警（缺货→低库存）排最前；汇总数对得上', async () => {
    const r = await get({ keyword: tag });
    expect(r.rows.map((x: Json) => [x.itemId === ids.OUT ? 'OUT' : x.itemId === ids.LOW ? 'LOW' : x.itemId === ids.OK ? 'OK' : 'NONE', x.status, x.quantity])).toEqual([
      ['OUT', 'OUT', 0],
      ['LOW', 'LOW', 3],
      ['OK', 'OK', 20],
      ['NONE', 'NO_THRESHOLD', 7],
    ]);
    expect(r.summary).toMatchObject({ itemCount: 4, alertCount: 2, outCount: 1, lowCount: 1, inStockCount: 3 });
    expect(r.summary.totalValue).toBe((3 + 20 + 7) * 200);
    const low = r.rows.find((x: Json) => x.itemId === ids.LOW);
    expect(low.warehouses).toEqual([{ warehouseId, warehouseName: `总览仓库${tag}`, quantity: 3 }]);
  });

  it('搜索和筛选：按名称搜；只看预警/缺货/有库存；按仓库只算该仓库', async () => {
    expect((await get({ keyword: `物品LOW${tag}` })).rows).toHaveLength(1);
    expect((await get({ keyword: 'ov_OK_' + tag })).rows).toHaveLength(1); // 按编码搜
    expect((await get({ keyword: 'zlwp ok ' + tag })).rows.map((x: Json) => x.itemId)).toEqual([ids.OK]); // 拼音首字母（总览物品OK）+ 编号尾数
    expect((await get({ keyword: tag, status: 'ALERT' })).rows.map((x: Json) => x.itemId)).toEqual([ids.OUT, ids.LOW]);
    expect((await get({ keyword: tag, status: 'OUT' })).rows.map((x: Json) => x.itemId)).toEqual([ids.OUT]);
    expect((await get({ keyword: tag, status: 'IN_STOCK' })).rows).toHaveLength(3);
    const other = await prisma.warehouse.findFirstOrThrow({ where: { id: { not: warehouseId } } });
    const inOther = await get({ keyword: tag, warehouseId: other.id });
    expect(inOther.rows.find((x: Json) => x.itemId === ids.OK).quantity).toBe(0); // 另一个仓库里没有
    await request(server).get('/api/v1/inventory/warehouse-stocks/overview').expect(401);
  });
});
