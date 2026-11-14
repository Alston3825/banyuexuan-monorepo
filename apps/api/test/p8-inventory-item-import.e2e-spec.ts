import { readFileSync } from 'fs';
import { join } from 'path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * 物品管理：Excel 导入（直接用现有的采购申购表）。样表 fixtures/purchase-list-sample.xlsx 与真实申购表同样的版式
 * （第一行是“申购部门”标题、第二行表头、最后一行“合计”），物品是虚构的。
 */
describe('P8 物品管理：Excel 导入采购清单 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let prisma: PrismaService;
  let adminToken: string;
  let staffToken: string;

  const SEED_PASSWORD = 'Passw0rd!23';
  const authed = (token: string) => ({ Authorization: `Bearer ${token}` });
  const sample = readFileSync(join(__dirname, 'fixtures', 'purchase-list-sample.xlsx'));
  const upload = (token = adminToken) => request(server).post('/api/v1/inventory/items/import/preview').set(authed(token)).attach('file', sample, 'purchase-list-sample.xlsx');

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    adminToken = (await request(server).post('/api/v1/auth/login').send({ username: 'admin', password: SEED_PASSWORD }).expect(201)).body.accessToken;
    staffToken = (await request(server).post('/api/v1/auth/login').send({ username: 'store_staff', password: SEED_PASSWORD }).expect(201)).body.accessToken;
    // 样表里的物品名固定，重复跑测试前先清掉上次导入的（只删“导入测试”开头、且没有库存/单据引用的）
    await prisma.inventoryItem.deleteMany({ where: { name: { startsWith: '导入测试' } } });
  });

  afterAll(async () => {
    await prisma.inventoryItem.deleteMany({ where: { name: { startsWith: '导入测试' } } });
    await app.close();
  });

  it('1. 上传申购表：自动找到表头行，识别名称/规格/品牌/单位/单价，数量、申请人等用不上的列说明忽略，“合计”行跳过', async () => {
    const res = await upload().expect(201);
    const p = res.body as Json;
    expect(p.headerRow).toBe(2);
    expect(p.ignoredColumns).toEqual(expect.arrayContaining(['序号', '申请部门', '申请人', '数量', '小计', '用途']));
    expect(p.rows).toHaveLength(6); // 6 个物品行，没有“合计”行
    const byRow = (n: number) => p.rows.find((r: Json) => r.rowNo === n);
    expect(byRow(3)).toMatchObject({ name: '导入测试清洁球', spec: '6个/包', unit: '包', referencePrice: 1.24, brand: null, status: 'NEW' });
    expect(byRow(4)).toMatchObject({ name: '导入测试垃圾袋', spec: '100*120', status: 'NEW' });
    expect(byRow(5)).toMatchObject({ name: '导入测试垃圾袋', spec: '100*80', referencePrice: null, status: 'NEW' }); // 同名不同规格 = 另一个物品；单价 0/空 = 没填
    expect(byRow(6)).toMatchObject({ brand: '测试品牌', referencePrice: 366 });
    expect(byRow(7)).toMatchObject({ name: '导入测试工服', unit: null, status: 'MISSING_UNIT' });
    expect(byRow(8)).toMatchObject({ name: '导入测试清洁球', status: 'DUP_IN_FILE' }); // 和第 3 行同名同规格
  });

  it('2. 权限与文件校验：没有物品新建权限的账号不能导入；不是 Excel 的文件、没带文件都会提示', async () => {
    await upload(staffToken).expect(403);
    await request(server).post('/api/v1/inventory/items/import/preview').set(authed(adminToken)).expect(400);
    await request(server).post('/api/v1/inventory/items/import/preview').set(authed(adminToken)).attach('file', Buffer.from('不是表格'), 'x.xlsx').expect(400);
  });

  it('3. 确认导入：新物品自动编码（WP0001…），带上规格/品牌/参考单价；缺单位的补上单位后可导入；重复的跳过', async () => {
    const preview = (await upload().expect(201)).body as Json;
    const items = preview.rows.map((r: Json) => (r.rowNo === 7 ? { ...r, unit: '套' } : r)); // 工服补单位
    const res = await request(server).post('/api/v1/inventory/items/import/commit').set(authed(adminToken)).send({ items, purpose: 'LOGISTICS', category: '后勤耗材', updateExisting: false }).expect(201);
    expect(res.body).toMatchObject({ created: 5, updated: 0, skipped: 1 });
    expect(res.body.skippedDetail[0]).toMatchObject({ rowNo: 8 });

    const list = (await request(server).get('/api/v1/inventory/items').set(authed(adminToken)).expect(200)).body as Json[];
    const mine = list.filter((i) => i.name.startsWith('导入测试'));
    expect(mine).toHaveLength(5);
    expect(mine.every((i) => /^WP\d{4}$/.test(i.code) && i.purpose === 'LOGISTICS' && i.category === '后勤耗材')).toBe(true);
    expect(new Set(mine.map((i) => i.code)).size).toBe(5); // 编码不重复
    const cabinet = mine.find((i) => i.name === '导入测试消毒柜')!;
    expect(cabinet).toMatchObject({ spec: '16L 白色', brand: '测试品牌', unit: '个' });
    expect(Number(cabinet.referencePrice)).toBe(366);
  });

  it('4. 再导入一次同一张表：这些物品都显示“系统里已有”；勾选“更新已有”只补品牌/参考单价，不新增、不动单位', async () => {
    const preview = (await upload().expect(201)).body as Json;
    expect(preview.rows.filter((r: Json) => r.status === 'EXISTS')).toHaveLength(5); // 5 个不同的物品都已存在（工服缺单位但已存在，也算已有）；第 8 行是表内重复
    expect(preview.rows.find((r: Json) => r.rowNo === 8).status).toBe('DUP_IN_FILE');
    const cleaner = preview.rows.find((r: Json) => r.rowNo === 3);
    const changed = preview.rows.map((r: Json) => (r.rowNo === 3 ? { ...r, brand: '新品牌', referencePrice: 1.5, unit: '袋' } : r));
    expect(cleaner.status).toBe('EXISTS');

    const skip = await request(server).post('/api/v1/inventory/items/import/commit').set(authed(adminToken)).send({ items: changed, purpose: 'LOGISTICS', updateExisting: false }).expect(201);
    expect(skip.body).toMatchObject({ created: 0, updated: 0 });

    const upd = await request(server).post('/api/v1/inventory/items/import/commit').set(authed(adminToken)).send({ items: changed, purpose: 'LOGISTICS', updateExisting: true }).expect(201);
    expect(upd.body.created).toBe(0);
    expect(upd.body.updated).toBe(3); // 清洁球(改了品牌价格)、垃圾袋100*120(有价格)、消毒柜(有品牌价格)；另两个没有品牌也没价格，无可更新
    const item = (await prisma.inventoryItem.findFirst({ where: { name: '导入测试清洁球' } }))!;
    expect(item).toMatchObject({ brand: '新品牌', unit: '包' }); // 单位保持原来的
    expect(Number(item.referencePrice)).toBe(1.5);
  });

  it('5. 手工新建/编辑物品也能填规格、品牌、参考单价；空字符串清空', async () => {
    const created = (
      await request(server)
        .post('/api/v1/inventory/items')
        .set(authed(adminToken))
        .send({ code: `IMP${Date.now().toString().slice(-8)}`, name: '导入测试手工物品', unit: '个', spec: ' 大号 ', brand: '品牌甲', referencePrice: 9.9 })
        .expect(201)
    ).body as Json;
    expect(created).toMatchObject({ spec: '大号', brand: '品牌甲' });
    const upd = (await request(server).patch(`/api/v1/inventory/items/${created.id}`).set(authed(adminToken)).send({ spec: '', brand: '品牌乙', referencePrice: null, version: created.version }).expect(200)).body as Json;
    expect(upd).toMatchObject({ spec: null, brand: '品牌乙', referencePrice: null });
  });
});
