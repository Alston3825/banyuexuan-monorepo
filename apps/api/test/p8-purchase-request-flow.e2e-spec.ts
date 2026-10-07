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
 * 申购单：每月的申购表 Excel → 申购单（草稿）→ 提交审批 → 批准 → 选供应商和仓库生成采购单。
 * 样表 fixtures/purchase-request-sample.xlsx 与真实申购表同版式（标题行“申购部门：xx店 日期”、表头、“合计”行），物品是虚构的。
 */
describe('P8 申购单：Excel 导入 + 审批 + 生成采购单 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let prisma: PrismaService;
  let adminToken: string;
  let managerToken: string;
  let otherManagerToken: string;
  let staffToken: string;
  let storeId: string;
  let supplierId: string;
  let warehouseId: string;

  const SEED_PASSWORD = 'Passw0rd!23';
  const runTag = Date.now().toString().slice(-8);
  const authed = (t: string) => ({ Authorization: `Bearer ${t}` });
  const sample = readFileSync(join(__dirname, 'fixtures', 'purchase-request-sample.xlsx'));
  const login = async (username: string) => (await request(server).post('/api/v1/auth/login').send({ username, password: SEED_PASSWORD }).expect(201)).body.accessToken as string;
  const upload = (token = adminToken) => request(server).post('/api/v1/inventory/purchase-requests/import/preview').set(authed(token)).attach('file', sample, 'purchase-request-sample.xlsx');
  const get = async (id: string) => (await request(server).get(`/api/v1/inventory/purchase-requests/${id}`).set(authed(adminToken)).expect(200)).body as Json;
  /** 每次用不同的申购日期，重复跑测试也不会撞上“当天已有申购单”的重复提示 */
  const day = `20${27 + (Number(runTag) % 60)}-${String(1 + (Number(runTag) % 12)).padStart(2, '0')}-${String(1 + (Number(runTag) % 28)).padStart(2, '0')}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    adminToken = await login('admin');
    managerToken = await login('store_manager');
    otherManagerToken = await login('test_user');
    staffToken = await login('store_staff');
    storeId = (await request(server).get('/api/v1/platform/stores').set(authed(adminToken)).expect(200)).body.find((s: Json) => s.name.includes('示例店')).id;
    supplierId = (await request(server).post('/api/v1/inventory/suppliers').set(authed(adminToken)).send({ code: `sgsup_${runTag}`, name: 'E2E申购供应商' }).expect(201)).body.id;
    warehouseId = (await request(server).post('/api/v1/inventory/warehouses').set(authed(adminToken)).send({ storeId, code: `sgwh_${runTag}`, name: 'E2E申购仓库', requiresApproval: false }).expect(201)).body.id;
    await prisma.inventoryItem.deleteMany({ where: { name: { startsWith: '申购测试' } } }); // 样表物品名固定，重复跑前清掉上次建的
  });

  afterAll(async () => {
    await app.close();
  });

  let preview: Json;
  let requestId: string;

  it('1. 上传申购表：读出标题里的门店和日期、每行的部门/申请人/物品/数量/单价/用途，对出表里合计，标出缺数量等问题', async () => {
    preview = (await upload().expect(201)).body as Json;
    expect(preview.headerRow).toBe(2);
    expect(preview.storeGuess.name).toContain('示例店'); // 标题“申购部门：示例店”
    expect(preview.requestDate).toBe('2026-03-08');
    expect(preview.sheetTotal).toBe(1323.1);
    expect(preview.rows).toHaveLength(7); // 没有“合计”行
    const row = (n: number) => preview.rows.find((r: Json) => r.rowNo === n);
    expect(row(3)).toMatchObject({ department: '保洁部', requester: '甲', name: '申购测试清洁球', spec: '6个/包', unit: '包', quantity: 20, unitPrice: 1.24, itemId: null, issues: [] });
    expect(row(8)).toMatchObject({ unitPrice: null, quantity: 15 }); // 保鲜膜没单价 = 待询价
    expect(row(9)).toMatchObject({ name: '申购测试工服', quantity: null, unit: null, issues: ['缺数量'] });
    await upload(staffToken).expect(201); // 普通员工也能申购（有 purchase-request.create）
    await request(server).post('/api/v1/inventory/purchase-requests/import/preview').set(authed(adminToken)).attach('file', Buffer.from('不是表格'), 'x.xlsx').expect(400);
  });

  it('2. 确认导入：缺数量的行不让导；补上数量后生成申购单，物品库里没有的按需新建并自动对上，金额按数量×单价算', async () => {
    const rows = preview.rows.map(({ sheetSubtotal, itemId, issues, ...r }: Json) => r);
    const commit = (body: Json) => request(server).post('/api/v1/inventory/purchase-requests/import/commit').set(authed(adminToken)).send({ storeId, requestDate: day, sourceFileName: '申购表.xlsx', createMissingItems: true, allowDuplicate: false, ...body });
    const bad = await commit({ rows }).expect(400);
    expect(bad.body.message).toContain('缺数量');

    const fixed = rows.map((r: Json) => (r.rowNo === 9 ? { ...r, quantity: 5, unit: '套' } : r));
    const res = (await commit({ rows: fixed }).expect(201)).body as Json;
    expect(res).toMatchObject({ lines: 7, linkedItems: 7, unlinked: [] });
    // 20×1.24 + 300×0.42 + 100×0.42 + 3×366 + 20×1.615 + 0(没单价) + 0 = 24.8+126+42+1098+32.3 = 1323.1
    expect(res.totalAmount).toBe(1323.1);
    requestId = res.id;

    const req = await get(requestId);
    expect(req).toMatchObject({ status: 'DRAFT', sourceFileName: '申购表.xlsx' });
    expect(req.requestDate.slice(0, 10)).toBe(day);
    expect(req.items).toHaveLength(7);
    expect(req.items.map((l: Json) => l.sortNo)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const garbage = req.items.filter((l: Json) => l.name === '申购测试垃圾袋');
    expect(garbage.map((l: Json) => l.department)).toEqual(['保洁部', '护理部']); // 同一物品两个部门各一行
    expect(garbage[0].itemId).toBe(garbage[1].itemId); // 对上同一个物品资料
    expect(garbage[1].purpose).toBe('托管室用');
    expect(Number(req.items.find((l: Json) => l.name === '申购测试手套').unitPrice)).toBe(1.615);
    expect(Number(req.items.find((l: Json) => l.name === '申购测试保鲜膜').unitPrice === null ? 0 : 1)).toBe(0);
    // 物品库里新建了这些物品（后勤用品、带规格/单价）
    const item = (await prisma.inventoryItem.findFirst({ where: { name: '申购测试消毒柜' } }))!;
    expect(item).toMatchObject({ spec: '16L 白色', brand: '测试品牌', unit: '个', purpose: 'LOGISTICS' });
  });

  it('3. 同一门店同一天再导入一次会提示重复，确认后才能再导', async () => {
    const rows = preview.rows.slice(0, 2).map(({ sheetSubtotal, itemId, issues, ...r }: Json) => r);
    const body = { storeId, requestDate: day, createMissingItems: true, rows };
    const dup = await request(server).post('/api/v1/inventory/purchase-requests/import/commit').set(authed(adminToken)).send({ ...body, allowDuplicate: false }).expect(409);
    expect(dup.body.message).toContain('已经有一张申购单');
    const check = (await request(server).get('/api/v1/inventory/purchase-requests/import/duplicate').query({ storeId, requestDate: day }).set(authed(adminToken)).expect(200)).body;
    expect(check.id).toBe(requestId);
    const again = (await request(server).post('/api/v1/inventory/purchase-requests/import/commit').set(authed(adminToken)).send({ ...body, allowDuplicate: true }).expect(201)).body;
    // 多出来的这张直接取消，不影响后面的流程
    const extra = await get(again.id);
    await request(server).post(`/api/v1/inventory/purchase-requests/${again.id}/cancel`).set(authed(adminToken)).send({ cancelReason: '测试重复导入', version: extra.version }).expect(201);
  });

  it('4. 草稿可以改明细（数量、单价、用途…），金额自动重算；可加行、删行', async () => {
    let req = await get(requestId);
    const wrap = req.items.find((l: Json) => l.name === '申购测试保鲜膜');
    const patch = (lineId: string, data: Json, version: number) => request(server).patch(`/api/v1/inventory/purchase-requests/${requestId}/items/${lineId}`).set(authed(adminToken)).send({ ...data, version });
    await patch(wrap.id, { quantity: 0 }, req.version).expect(400);
    const upd = (await patch(wrap.id, { unitPrice: 17.8, purpose: '厨房用' }, req.version).expect(200)).body as Json;
    expect(Number(upd.totalAmount)).toBe(1323.1 + 267); // 15 × 17.8 = 267
    await patch(wrap.id, { quantity: 1 }, req.version).expect(409); // 版本号已过期
    req = await get(requestId);
    const added = (
      await request(server).post(`/api/v1/inventory/purchase-requests/${requestId}/items`).set(authed(adminToken)).send({ name: '申购测试手工加的', quantity: 2, unitPrice: 10, unit: '个', department: '客服部', version: req.version }).expect(201)
    ).body as Json;
    expect(Number(added.totalAmount)).toBe(1323.1 + 267 + 20);
    expect(added.items).toHaveLength(8);
    const extraLine = added.items.find((l: Json) => l.name === '申购测试手工加的');
    expect(extraLine.itemId).toBeNull(); // 物品库里没有，先不对应
    const removed = (await request(server).delete(`/api/v1/inventory/purchase-requests/${requestId}/items/${extraLine.id}`).query({ version: added.version }).set(authed(adminToken)).expect(200)).body as Json;
    expect(removed.items).toHaveLength(7);
    expect(Number(removed.totalAmount)).toBe(1323.1 + 267);
  });

  it('5. 提交审批（店长审批）→ 批准后不能再改明细、不能提交两次', async () => {
    const req = await get(requestId);
    const submitted = (await request(server).post(`/api/v1/inventory/purchase-requests/${requestId}/submit`).set(authed(adminToken)).send({ version: req.version }).expect(201)).body as Json;
    expect(submitted.status).toBe('PENDING_APPROVAL');
    await request(server).post(`/api/v1/inventory/purchase-requests/${requestId}/submit`).set(authed(adminToken)).send({ version: submitted.version }).expect(400);

    const instance = (await request(server).get('/api/v1/workflow/instances').query({ businessType: 'PURCHASE_REQUEST', businessId: requestId }).set(authed(adminToken)).expect(200)).body as Json;
    await request(server).post(`/api/v1/workflow/instances/${instance.id}/approve`).set(authed(managerToken)).send({ comment: '同意' }).expect(201);
    await request(server).post(`/api/v1/workflow/instances/${instance.id}/approve`).set(authed(otherManagerToken)).send({ comment: '同意' }).expect(409); // 本店店长批完就通过了，另一门店的店长不是审批人
    const approved = await get(requestId);
    expect(approved.status).toBe('APPROVED');
    const line = approved.items[0];
    await request(server).patch(`/api/v1/inventory/purchase-requests/${requestId}/items/${line.id}`).set(authed(adminToken)).send({ quantity: 99, version: approved.version }).expect(400);
  });

  it('6. 生成采购单：有没单价的行要先补；补全后生成草稿采购单（单价按分四舍五入），申购单变“已生成采购单”', async () => {
    const approved = await get(requestId);
    const convert = (body: Json, version = approved.version) => request(server).post(`/api/v1/inventory/purchase-requests/${requestId}/convert`).set(authed(adminToken)).send({ supplierId, warehouseId, version, ...body });
    // 把一行价格抹掉模拟“批准后才知道报价”：直接改库
    const target = approved.items.find((l: Json) => l.name === '申购测试保鲜膜');
    await prisma.purchaseRequestItem.update({ where: { id: target.id }, data: { unitPrice: null, subtotal: 0 } });
    const blocked = await convert({}).expect(400);
    expect(blocked.body.message).toContain('申购测试保鲜膜');
    expect(blocked.body.message).toContain('没有单价');

    const uniform = approved.items.find((l: Json) => l.name === '申购测试工服');
    const resp = await convert({ fixes: [{ lineId: target.id, unitPrice: 17.8 }, { lineId: uniform.id, unitPrice: 50 }] }); // 保鲜膜、工服都在批准后才报价
    if (resp.status !== 201) throw new Error(JSON.stringify(resp.body));
    const res = resp.body as Json;
    expect(res.request.status).toBe('ORDERED');
    expect(res.request.purchaseOrderId).toBe(res.purchaseOrder.id);
    const order = (await request(server).get(`/api/v1/inventory/purchase-orders/${res.purchaseOrder.id}`).set(authed(adminToken)).expect(200)).body as Json;
    expect(order).toMatchObject({ status: 'APPROVED', supplierId, warehouseId }); // 申购单已经店长审批，采购单直接是“待采购”，不再审批
    expect(order.items).toHaveLength(7);
    const glove = order.items.find((i: Json) => i.item.name === '申购测试手套');
    expect(glove).toMatchObject({ quantity: 20, unitPrice: 162 }); // 1.615 元 → 162 分
    // 申购单 24.8+126+42+1098+32.3+267+250 = 1840.1 元；采购单手套 20×162 分 比申购单多 0.1 元，差额如实告知
    expect(order.totalAmount).toBe(184020);
    expect(res.amountDiff).toBeCloseTo(0.1, 2);
    await convert({}, res.request.version).expect(400); // 已经生成过，不能再生成
  });

  it('7. 取消/权限：已生成采购单的不能取消；没有权限的账号拿不到列表', async () => {
    const req = await get(requestId);
    await request(server).post(`/api/v1/inventory/purchase-requests/${requestId}/cancel`).set(authed(adminToken)).send({ cancelReason: '想取消', version: req.version }).expect(400);
    const list = (await request(server).get('/api/v1/inventory/purchase-requests').query({ storeId }).set(authed(adminToken)).expect(200)).body as Json[];
    const mine = list.find((r) => r.id === requestId)!;
    expect(mine).toMatchObject({ status: 'ORDERED', _count: { items: 7 } });
    await request(server).get('/api/v1/inventory/purchase-requests').set(authed(staffToken)).expect(200);
    await request(server).get('/api/v1/inventory/purchase-requests').expect(401);
  });
});
