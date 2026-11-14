import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 申购单/采购单手动新建：物品库搜索选物品，或填没采购过的新物品（按需加入物品库）。 */
describe('P8 手动新建申购单 / 采购单 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let prisma: PrismaService;
  let adminToken: string;
  let staffToken: string;
  let storeId: string;
  let supplierId: string;
  let warehouseId: string;
  const tag = Date.now().toString().slice(-7);
  const authed = (t: string) => ({ Authorization: `Bearer ${t}` });
  let existingItemId: string;
  const existingName = `手动申购已有物品${tag}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    const login = async (u: string) => ((await request(server).post('/api/v1/auth/login').send({ username: u, password: 'Passw0rd!23' }).expect(201)).body as Json).accessToken as string;
    adminToken = await login('admin');
    staffToken = await login('store_staff');
    storeId = ((await request(server).get('/api/v1/platform/stores').set(authed(adminToken)).expect(200)).body as Json[]).find((s) => s.name.includes('示例店'))!.id;
    supplierId = ((await request(server).post('/api/v1/inventory/suppliers').set(authed(adminToken)).send({ code: `mpsup_${tag}`, name: `手动采购供应商${tag}` }).expect(201)).body as Json).id;
    warehouseId = ((await request(server).post('/api/v1/inventory/warehouses').set(authed(adminToken)).send({ storeId, code: `mpwh_${tag}`, name: `手动采购仓库${tag}`, requiresApproval: false }).expect(201)).body as Json).id;
    existingItemId = ((await request(server).post('/api/v1/inventory/items').set(authed(adminToken)).send({ code: `mp_${tag}`, name: existingName, unit: '箱', spec: '大号', referencePrice: 12.5 }).expect(201)).body as Json).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. 物品搜索：按名称/规格模糊搜，普通员工也能用（只返回基础资料）', async () => {
    const r = (await request(server).get('/api/v1/inventory/items/search').query({ keyword: `手动申购已有物品${tag}` }).set(authed(staffToken)).expect(200)).body as Json[];
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: existingItemId, unit: '箱', spec: '大号' });
    const bySpec = (await request(server).get('/api/v1/inventory/items/search').query({ keyword: '大号' }).set(authed(staffToken)).expect(200)).body as Json[];
    expect(bySpec.some((x) => x.id === existingItemId)).toBe(true);
    // 拼音首字母 / 全拼也能搜（手动申购已有物品 → sdsgyywp / shoudongshengou）
    const byInitials = (await request(server).get('/api/v1/inventory/items/search').query({ keyword: 'sdsgyywp' }).set(authed(staffToken)).expect(200)).body as Json[];
    expect(byInitials.some((x) => x.id === existingItemId)).toBe(true);
    const byFull = (await request(server).get('/api/v1/inventory/items/search').query({ keyword: 'shoudongshengou' }).set(authed(staffToken)).expect(200)).body as Json[];
    expect(byFull.some((x) => x.id === existingItemId)).toBe(true);
    await request(server).get('/api/v1/inventory/items/search').expect(401);
  });

  it('2. 手动新建申购单：选已有物品 + 填新物品（写了单位的同时加入物品库），保存为汇总申购单草稿，金额按数量×单价', async () => {
    const newName = `手动申购新物品${tag}`;
    const created = (
      await request(server)
        .post('/api/v1/inventory/purchase-requests')
        .set(authed(adminToken))
        .send({
          storeId,
          requestDate: '2026-10-14',
          remark: '手动新建测试',
          createMissingItems: true,
          items: [
            { itemId: existingItemId, name: existingName, spec: '大号', unit: '箱', quantity: 3, unitPrice: 12.5, purpose: '日常' },
            { name: newName, spec: '中号', unit: '个', quantity: 5, unitPrice: 2 },
          ],
        })
        .expect(201)
    ).body as Json;
    expect(created).toMatchObject({ kind: 'SUMMARY', status: 'DRAFT' });
    expect(Number(created.totalAmount)).toBe(3 * 12.5 + 5 * 2);
    expect(created.items).toHaveLength(2);
    expect(created.items[0].itemId).toBe(existingItemId);
    const made = await prisma.inventoryItem.findFirst({ where: { name: newName } });
    expect(made).toBeTruthy();
    expect(created.items[1].itemId).toBe(made!.id); // 新物品已加入物品库并对上

    // 不勾“加入物品库”：新物品只作为申购行，不进物品库
    const free = `手动申购临时物品${tag}`;
    const c2 = (await request(server).post('/api/v1/inventory/purchase-requests').set(authed(adminToken)).send({ storeId, items: [{ name: free, unit: '个', quantity: 1 }] }).expect(201)).body as Json;
    expect(c2.items[0].itemId).toBeNull();
    expect(await prisma.inventoryItem.count({ where: { name: free } })).toBe(0);

    // 校验：没有物品 / 缺数量 / 没有权限
    await request(server).post('/api/v1/inventory/purchase-requests').set(authed(adminToken)).send({ storeId, items: [] }).expect(400);
    await request(server).post('/api/v1/inventory/purchase-requests').set(authed(adminToken)).send({ storeId, items: [{ name: 'x' }] }).expect(400);
    // 草稿可以接着补单价、提交（和导入的申购单一样）
    const first = created.items[1];
    await request(server).patch(`/api/v1/inventory/purchase-requests/${created.id}/items/${first.id}`).set(authed(adminToken)).send({ unitPrice: 3, version: created.version }).expect(200);
  });

  it('3. 手动新建采购单：选已有物品 + 新物品（自动加入物品库），单价按分；同名同规格不重复建', async () => {
    const newName = `手动采购新物品${tag}`;
    const order = (
      await request(server)
        .post('/api/v1/inventory/purchase-orders')
        .set(authed(adminToken))
        .send({
          storeId,
          warehouseId,
          supplierId,
          items: [
            { itemId: existingItemId, quantity: 2, unitPrice: 1250 },
            { newItem: { name: newName, spec: '小号', unit: '桶' }, quantity: 4, unitPrice: 500 },
          ],
        })
        .expect(201)
    ).body as Json;
    expect(order.totalAmount).toBe(2 * 1250 + 4 * 500);
    const made = await prisma.inventoryItem.findFirstOrThrow({ where: { name: newName } });
    expect(made).toMatchObject({ unit: '桶', spec: '小号' });
    expect(order.items.map((i: Json) => i.itemId)).toEqual(expect.arrayContaining([existingItemId, made.id]));

    // 再来一次同名同规格：对上已有，不重复建
    await request(server).post('/api/v1/inventory/purchase-orders').set(authed(adminToken)).send({ storeId, warehouseId, supplierId, items: [{ newItem: { name: newName, spec: '小号', unit: '桶' }, quantity: 1, unitPrice: 500 }] }).expect(201);
    expect(await prisma.inventoryItem.count({ where: { name: newName } })).toBe(1);
    // 既没选物品也没写新物品 → 400
    await request(server).post('/api/v1/inventory/purchase-orders').set(authed(adminToken)).send({ storeId, warehouseId, supplierId, items: [{ quantity: 1, unitPrice: 1 }] }).expect(400);
  });
});
