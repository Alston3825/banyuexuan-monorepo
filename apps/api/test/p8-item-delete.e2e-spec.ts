import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { nameSimilarity } from '../src/inventory/common/item-similarity';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 物品删除：无库存无记录→真删；有记录无库存→隐藏；有库存→库管不能删，管理员只能隐藏 */
describe('P8 物品删除 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let prisma: PrismaService;
  let token: string;
  let storeId: string;
  let warehouseId: string;
  const tag = Date.now().toString().slice(-7);
  const authed = () => ({ Authorization: `Bearer ${token}` });
  const mkItem = async (name: string) => (await request(server).post('/api/v1/inventory/items').set(authed()).send({ name: `${name}${tag}`, unit: '个' }).expect(201)).body as Json;

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
    warehouseId = ((await request(server).post('/api/v1/inventory/warehouses').set(authed()).send({ storeId, code: `delwh_${tag}`, name: `删除测试仓库${tag}`, requiresApproval: false }).expect(201)).body as Json).id;
  });
  afterAll(async () => {
    await app.close();
  });

  it('没有库存也没有记录 → 直接删除', async () => {
    const it = await mkItem('可删物品');
    const chk = (await request(server).get(`/api/v1/inventory/items/${it.id}/delete-check`).set(authed()).expect(200)).body as Json;
    expect(chk.outcome).toBe('DELETE');
    const r = (await request(server).delete(`/api/v1/inventory/items/${it.id}`).set(authed()).expect(200)).body as Json;
    expect(r.outcome).toBe('DELETED');
    expect(await prisma.inventoryItem.findUnique({ where: { id: it.id } })).toBeNull();
  });

  it('有单据记录、无库存 → 只隐藏（停用），搜索不再出现', async () => {
    const it = await mkItem('有记录物品');
    await request(server).post('/api/v1/inventory/goods-receipts').set(authed()).send({ storeId, warehouseId, items: [{ itemId: it.id, quantity: 2, unitCost: 100 }] }).expect(201);
    const r = (await request(server).delete(`/api/v1/inventory/items/${it.id}`).set(authed()).expect(200)).body as Json;
    expect(r.outcome).toBe('HIDDEN');
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: it.id } })).status).toBe('INACTIVE');
    const found = (await request(server).get('/api/v1/inventory/items/search').query({ keyword: `有记录物品${tag}` }).set(authed()).expect(200)).body as Json[];
    expect(found.map((x) => x.id)).not.toContain(it.id);
  });

  it('有库存 → 管理员（有 force-delete）也只是隐藏，库存数据保留', async () => {
    const it = await mkItem('有库存物品');
    await prisma.warehouseStock.create({ data: { warehouseId, itemId: it.id, quantity: 5 } });
    const chk = (await request(server).get(`/api/v1/inventory/items/${it.id}/delete-check`).set(authed()).expect(200)).body as Json;
    expect(chk).toMatchObject({ outcome: 'HIDE', stockQty: 5 });
    await request(server).delete(`/api/v1/inventory/items/${it.id}`).set(authed()).expect(200);
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: it.id } })).status).toBe('INACTIVE');
    expect(await prisma.warehouseStock.count({ where: { itemId: it.id } })).toBe(1);
  });
});
