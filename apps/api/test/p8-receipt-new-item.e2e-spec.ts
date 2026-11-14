import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { nameSimilarity } from '../src/inventory/common/item-similarity';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 入库单里的新物品：自动加入物品库；名称相近的先查重，人工选“用已有 / 改用新名称 / 新增” */
describe('P8 入库新物品与相似名称核对 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let prisma: PrismaService;
  let token: string;
  let storeId: string;
  let warehouseId: string;
  const tag = Date.now().toString().slice(-7);
  const authed = () => ({ Authorization: `Bearer ${token}` });
  const mkReceipt = (items: Json[]) => request(server).post('/api/v1/inventory/goods-receipts').set(authed()).send({ storeId, warehouseId, items });

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
    warehouseId = ((await request(server).post('/api/v1/inventory/warehouses').set(authed()).send({ storeId, code: `rnwh_${tag}`, name: `入库新物品仓库${tag}`, requiresApproval: false }).expect(201)).body as Json).id;
  });
  afterAll(async () => {
    await app.close();
  });

  it('名称相似度：一样=1，包含=0.85，完全不相干很低', () => {
    expect(nameSimilarity('保鲜膜', ' 保鲜膜 ')).toBe(1);
    expect(nameSimilarity('保鲜膜', '一次性保鲜膜')).toBeCloseTo(0.85);
    expect(nameSimilarity('洗洁精', '垃圾袋')).toBeLessThan(0.3);
  });

  it('查重接口：返回相似物品（名称规格都一样标 exact）；不相干的不返回', async () => {
    const base = (await request(server).post('/api/v1/inventory/items').set(authed()).send({ name: `一次性保鲜膜${tag}`, spec: '30cm', unit: '卷' }).expect(201)).body as Json;
    const r = (await request(server).get('/api/v1/inventory/items/similar').query({ name: `保鲜膜${tag}`, spec: '50cm' }).set(authed()).expect(200)).body as Json[];
    expect(r.map((x) => x.id)).toContain(base.id);
    expect(r.find((x) => x.id === base.id)).toMatchObject({ exact: false });
    const ex = (await request(server).get('/api/v1/inventory/items/similar').query({ name: `一次性保鲜膜${tag}`, spec: '30cm' }).set(authed()).expect(200)).body as Json[];
    expect(ex[0]).toMatchObject({ id: base.id, exact: true });
    const none = (await request(server).get('/api/v1/inventory/items/similar').query({ name: `火箭发动机${tag}` }).set(authed()).expect(200)).body as Json[];
    expect(none).toEqual([]);
  });

  it('入库单里写新物品：自动加入物品库（自动编码，用途后勤/办公）；同名同规格已有的直接用已有的，不重复建', async () => {
    const created = (await mkReceipt([{ newItem: { name: `全新物品${tag}`, spec: '大号', unit: '箱' }, quantity: 3, unitCost: 1200 }]).expect(201)).body as Json;
    const item = await prisma.inventoryItem.findFirstOrThrow({ where: { name: `全新物品${tag}` } });
    expect(item).toMatchObject({ unit: '箱', spec: '大号', purpose: 'LOGISTICS' });
    expect(item.code).toMatch(/^WP\d{4,}$/);
    expect(created.items[0].itemId).toBe(item.id);
    await mkReceipt([{ newItem: { name: `全新物品${tag}`, spec: '大号', unit: '箱' }, quantity: 1, unitCost: 1200 }]).expect(201);
    expect(await prisma.inventoryItem.count({ where: { name: `全新物品${tag}` } })).toBe(1);
    await mkReceipt([{ quantity: 1, unitCost: 1 }]).expect(400); // 既没选物品也没写新物品
  });

  it('人工核对后：用已有物品（名称不变）/ 用已有物品并改成新名称', async () => {
    const old = (await request(server).post('/api/v1/inventory/items').set(authed()).send({ name: `旧名称洗洁精${tag}`, unit: '桶' }).expect(201)).body as Json;
    await mkReceipt([{ itemId: old.id, quantity: 2, unitCost: 500 }]).expect(201);
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: old.id } })).name).toBe(`旧名称洗洁精${tag}`);
    const r = (await mkReceipt([{ itemId: old.id, renameItemTo: `新名称洗洁精${tag}`, quantity: 2, unitCost: 500 }]).expect(201)).body as Json;
    expect(r.items[0].itemId).toBe(old.id);
    expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: old.id } })).name).toBe(`新名称洗洁精${tag}`);
  });
});
