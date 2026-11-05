import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * 采购全流程：部门负责人填部门申购单 → 自动出现在客服待汇总 → 客服汇总并提交店长审批 → 批准后生成采购单（不再审批）
 * → 采购员“确认采购”自动生成入库单 → 客服按快递逐项确认收货（可分批）→ 全部到齐。
 */
describe('P8 采购全流程：部门申购→汇总→店长审批→采购→分批收货入库 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let prisma: PrismaService;
  const PWD = 'banyuexuan';
  const tag = Date.now().toString().slice(-6);
  const PHONES = ['19900011001', '19900011002', '19900011003'];

  let adminToken: string;
  let managerToken: string;
  let headToken: string; // 部门负责人
  let csToken: string; // 客服
  let buyerToken: string; // 采购员
  let storeId: string;
  let warehouseId: string;
  let supplierId: string;
  let itemA: Json;
  let itemB: Json;

  const authed = (t: string) => ({ Authorization: `Bearer ${t}` });
  const get = (t: string, url: string) => request(server).get(`/api/v1${url}`).set(authed(t));
  const post = (t: string, url: string, body: Json = {}) => request(server).post(`/api/v1${url}`).set(authed(t)).send(body);
  const patch = (t: string, url: string, body: Json = {}) => request(server).patch(`/api/v1${url}`).set(authed(t)).send(body);
  const todos = async (t: string) => (await get(t, '/workspace/todos').expect(200)).body as Json;
  const stockQty = async (itemId: string) => (await prisma.warehouseStock.findUnique({ where: { warehouseId_itemId: { warehouseId, itemId } } }))?.quantity ?? 0;

  async function cleanup() {
    const accs = await prisma.account.findMany({ where: { phone: { in: PHONES } }, select: { id: true } });
    const ids = accs.map((a) => a.id);
    await prisma.accountRoleAssignment.deleteMany({ where: { accountId: { in: ids } } });
    await prisma.refreshToken.deleteMany({ where: { accountId: { in: ids } } });
    await prisma.staffDevice.deleteMany({ where: { accountId: { in: ids } } });
    await prisma.account.deleteMany({ where: { id: { in: ids } } });
  }

  async function makeUser(label: string, phone: string, roleCode: string, departmentId?: string) {
    const created = (await post(adminToken, '/platform/accounts', { username: phone, realName: label, password: PWD, phone, storeId, departmentId }).expect(201)).body;
    const role = await prisma.role.findFirstOrThrow({ where: { code: roleCode } });
    await post(adminToken, `/platform/accounts/${created.id}/role-assignments`, { roleId: role.id, scopeType: 'STORE', scopeId: storeId }).expect(201);
    return ((await request(server).post('/api/v1/auth/login').send({ username: phone, password: PWD }).expect(201)).body as Json).accessToken as string;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    await cleanup();
    const login = async (u: string, p = 'Passw0rd!23') => ((await request(server).post('/api/v1/auth/login').send({ username: u, password: p }).expect(201)).body as Json).accessToken as string;
    adminToken = await login('admin');
    managerToken = await login('store_manager');
    storeId = ((await get(adminToken, '/platform/stores').expect(200)).body as Json[]).find((s) => s.name.includes('示例店'))!.id;
    const dept = (await post(adminToken, '/platform/departments', { name: `采购测试护理部${tag}`, storeId }).expect(201)).body;
    headToken = await makeUser('采购测试部门负责人', PHONES[0], 'DEPT_HEAD', dept.id);
    csToken = await makeUser('采购测试客服', PHONES[1], 'CUSTOMER_SERVICE');
    buyerToken = await makeUser('采购测试采购员', PHONES[2], 'PURCHASER');
    warehouseId = (await post(adminToken, '/inventory/warehouses', { storeId, code: `pw${tag}`, name: `采购测试仓${tag}`, requiresApproval: false }).expect(201)).body.id;
    supplierId = (await post(adminToken, '/inventory/suppliers', { code: `ps${tag}`, name: `采购测试供应商${tag}` }).expect(201)).body.id;
    itemA = (await post(adminToken, '/inventory/items', { code: `pa${tag}`, name: `采购测试纸巾${tag}`, unit: '箱', spec: '大号', shelfLifeDays: 365 }).expect(201)).body;
    itemB = (await post(adminToken, '/inventory/items', { code: `pb${tag}`, name: `采购测试洗衣液${tag}`, unit: '桶' }).expect(201)).body;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  let dept1: Json;
  let summary: Json;
  let order: Json;
  let receipt: Json;

  it('1. 部门负责人填部门申购单并提交：申请部门/申请人自动带出，提交后不审批，等客服汇总；只能看到自己的', async () => {
    dept1 = (
      await post(headToken, '/inventory/purchase-requests/department', {
        submit: true,
        items: [
          { name: itemA.name, spec: '大号', quantity: 10, unit: '箱', purpose: '客房用' },
          { name: itemB.name, quantity: 4, unit: '桶' },
        ],
      }).expect(201)
    ).body;
    expect(dept1).toMatchObject({ kind: 'DEPARTMENT', status: 'SUBMITTED', departmentName: `采购测试护理部${tag}` });
    expect(dept1.items[0]).toMatchObject({ department: `采购测试护理部${tag}`, requester: '采购测试部门负责人' });
    expect(dept1.items[0].itemId).toBe(itemA.id); // 名称+规格自动对上物品库
    const mine = (await get(headToken, '/inventory/purchase-requests').expect(200)).body as Json[];
    expect(mine.every((r) => r.kind === 'DEPARTMENT')).toBe(true);
    expect(mine.some((r) => r.id === dept1.id)).toBe(true);
    // 部门负责人不能汇总，也看不到别人的/汇总申购单
    await post(headToken, '/inventory/purchase-requests/collect', { ids: [dept1.id] }).expect(403);
  });

  it('2. 自动汇总到客服：客服的待办里出现“待汇总”；客服汇总成一张汇总申购单，原部门申购单变“已汇总”', async () => {
    const t = await todos(csToken);
    expect(t.items.find((i: Json) => i.kind === 'COLLECT').title).toContain('待汇总');
    const list = (await get(csToken, '/inventory/purchase-requests').query({ kind: 'DEPARTMENT', status: 'SUBMITTED' }).expect(200)).body as Json[];
    expect(list.some((r) => r.id === dept1.id && r.creatorName === '采购测试部门负责人')).toBe(true);

    summary = (await post(csToken, '/inventory/purchase-requests/collect', { ids: [dept1.id] }).expect(201)).body;
    expect(summary).toMatchObject({ kind: 'SUMMARY', status: 'DRAFT' });
    expect(summary.items).toHaveLength(2);
    expect(summary.items[0].department).toBe(`采购测试护理部${tag}`);
    const d = (await get(headToken, `/inventory/purchase-requests/${dept1.id}`).expect(200)).body;
    expect(d.status).toBe('COLLECTED');
    expect(d.summaryRequest.id).toBe(summary.id);
    // 已汇总的不能再汇总
    await post(csToken, '/inventory/purchase-requests/collect', { ids: [dept1.id] }).expect(400);
  });

  it('3. 客服补全单价后提交，店长审批通过；店长的待办里有这张单，审批通过后采购员/客服的待办出现“待生成采购单”', async () => {
    // 部门负责人看不到汇总申购单
    await get(headToken, `/inventory/purchase-requests/${summary.id}`).expect(403);
    for (const [line, price] of [[summary.items[0], 20], [summary.items[1], 35.5]] as [Json, number][]) {
      await patch(csToken, `/inventory/purchase-requests/${summary.id}/items/${line.id}`, { unitPrice: price, version: (await get(csToken, `/inventory/purchase-requests/${summary.id}`).expect(200)).body.version }).expect(200);
    }
    const cur = (await get(csToken, `/inventory/purchase-requests/${summary.id}`).expect(200)).body;
    expect(Number(cur.totalAmount)).toBe(342);
    const submitted = (await post(csToken, `/inventory/purchase-requests/${summary.id}/submit`, { version: cur.version }).expect(201)).body;
    expect(submitted.status).toBe('PENDING_APPROVAL');

    // 审批人（店长）通过前可以改明细；提交人（客服）、其他人不能
    const ver = async () => (await get(managerToken, `/inventory/purchase-requests/${summary.id}`).expect(200)).body as Json;
    const before = await ver();
    expect(before.canApproverEdit).toBe(true);
    expect(((await get(csToken, `/inventory/purchase-requests/${summary.id}`).expect(200)).body as Json).canApproverEdit).toBe(false);
    await patch(csToken, `/inventory/purchase-requests/${summary.id}/items/${before.items[0].id}`, { quantity: 99, version: before.version }).expect(400);
    const edited = (await patch(managerToken, `/inventory/purchase-requests/${summary.id}/items/${before.items[0].id}`, { quantity: 12, brand: '店长改的品牌', version: before.version }).expect(200)).body as Json;
    expect(edited.items[0]).toMatchObject({ quantity: 12, brand: '店长改的品牌' });
    expect(Number(edited.totalAmount)).toBe(12 * 20 + 4 * 35.5); // 合计跟着重算
    expect(edited.canApproverEdit).toBe(true);
    expect(await prisma.auditLog.count({ where: { entityType: 'PurchaseRequest', entityId: summary.id, remark: { startsWith: '审批人修改明细' } } })).toBe(1);
    await patch(managerToken, `/inventory/purchase-requests/${summary.id}/items/${before.items[0].id}`, { quantity: 10, version: edited.version }).expect(200); // 改回去，不影响后面的用例

    const mgr = await todos(managerToken);
    const item = mgr.items.find((i: Json) => i.kind === 'APPROVAL' && i.title.includes(submitted.requestNo));
    expect(item).toBeTruthy();
    const instanceId = item.link.split('/').pop();
    await post(managerToken, `/workflow/instances/${instanceId}/approve`, { comment: '同意采购' }).expect(201);

    // 采购员、客服：待生成采购单
    for (const tok of [buyerToken, csToken]) {
      const t = await todos(tok);
      expect(t.items.some((i: Json) => i.kind === 'PURCHASE' && i.title.includes('待生成采购单') && i.title.includes(submitted.requestNo))).toBe(true);
    }
    const approved = (await get(buyerToken, `/inventory/purchase-requests/${summary.id}`).expect(200)).body;
    expect(approved.status).toBe('APPROVED');
    summary = approved;
  });

  it('4. 采购员生成采购单：直接是“待采购”，不再审批；采购员待办里出现；部门申购单不能直接生成采购单', async () => {
    const bad = await post(buyerToken, `/inventory/purchase-requests/${dept1.id}/convert`, { supplierId, warehouseId, version: 0 }).expect(400);
    expect(bad.body.message).toContain('先由客服汇总');
    const res = (await post(buyerToken, `/inventory/purchase-requests/${summary.id}/convert`, { supplierId, warehouseId, version: summary.version }).expect(201)).body as Json;
    order = res.purchaseOrder;
    expect(order.status).toBe('APPROVED');
    expect(await prisma.workflowInstance.count({ where: { businessType: 'PURCHASE_ORDER', businessId: order.id } })).toBe(0); // 没走审批
    expect(res.request.status).toBe('ORDERED');
    const t = await todos(buyerToken);
    expect(t.items.some((i: Json) => i.kind === 'PURCHASE' && i.title.includes(`待采购：${order.orderNo}`))).toBe(true);
    // 客服没有“确认采购”权限
    await post(csToken, `/inventory/purchase-orders/${order.id}/confirm-purchase`, { version: order.version }).expect(403);
  });

  it('5. 采购员点“确认采购”：采购单变“已采购”，自动生成待收货的入库单（按采购单逐项列出）', async () => {
    const r = (await post(buyerToken, `/inventory/purchase-orders/${order.id}/confirm-purchase`, { version: order.version, expressNo: 'SF1234567890', note: '线上一次买齐' }).expect(201)).body as Json;
    expect(r.order).toMatchObject({ status: 'PURCHASED', expressNo: 'SF1234567890' });
    expect(r.receipt).toMatchObject({ status: 'PENDING_RECEIPT', tracked: true, purchaseOrderId: order.id });
    receipt = (await get(csToken, `/inventory/goods-receipts/${r.receipt.id}`).expect(200)).body;
    expect(receipt.items.map((i: Json) => [i.quantity, i.receivedQuantity])).toEqual([[10, 0], [4, 0]]);
    // 重复确认不行
    await post(buyerToken, `/inventory/purchase-orders/${order.id}/confirm-purchase`, { version: r.order.version }).expect(400);
    // 客服待办：待收货
    expect((await todos(csToken)).items.some((i: Json) => i.kind === 'RECEIVE' && i.title.includes(receipt.receiptNo))).toBe(true);
    // 逐项收货的入库单不能走“提交/执行”
    await post(adminToken, `/inventory/goods-receipts/${receipt.id}/submit`, { version: receipt.version }).expect(400);
  });

  it('6. 货陆续到：客服第一次只确认纸巾到了 6 箱 → 立即入库，入库单/采购单变“部分到货”；超收被拦', async () => {
    const lineA = receipt.items.find((i: Json) => i.itemId === itemA.id);
    const lineB = receipt.items.find((i: Json) => i.itemId === itemB.id);
    const over = await post(csToken, `/inventory/goods-receipts/${receipt.id}/receive`, { lines: [{ receiptItemId: lineA.id, quantity: 11 }] }).expect(400);
    expect(over.body.message).toContain('最多还能收 10');
    await post(buyerToken, `/inventory/goods-receipts/${receipt.id}/receive`, { lines: [{ receiptItemId: lineA.id, quantity: 1 }] }).expect(403); // 采购员不负责收货

    const r1 = (await post(csToken, `/inventory/goods-receipts/${receipt.id}/receive`, { expressNo: 'YT111', lines: [{ receiptItemId: lineA.id, quantity: 6, note: '1 箱外包装压坏但商品完好' }] }).expect(201)).body as Json;
    expect(r1.status).toBe('PARTIALLY_RECEIVED');
    expect(r1.items.find((i: Json) => i.id === lineA.id).receivedQuantity).toBe(6);
    expect(r1.items.find((i: Json) => i.id === lineB.id).receivedQuantity).toBe(0);
    expect(r1.confirmations).toHaveLength(1);
    expect(r1.confirmations[0]).toMatchObject({ expressNo: 'YT111' });
    expect(await stockQty(itemA.id)).toBe(6);
    expect(await stockQty(itemB.id)).toBe(0);
    expect((await prisma.stockBatch.findFirst({ where: { warehouseId, itemId: itemA.id } }))!.expiresAt).toBeTruthy(); // 按保质期推算了效期
    const po = (await get(csToken, `/inventory/purchase-orders/${order.id}`).expect(200)).body;
    expect(po.status).toBe('PARTIALLY_RECEIVED');
    // 部分到货时待办里还在，提示还有几项没到齐
    expect((await todos(csToken)).items.find((i: Json) => i.kind === 'RECEIVE' && i.title.includes(receipt.receiptNo)).desc).toContain('还有 2 项没到齐');
    receipt = r1;
  });

  it('7. 第二批、第三批到齐：最后一项确认完 → 入库单和采购单自动“已完成”，待办消失；库存、成本正确', async () => {
    const lineA = receipt.items.find((i: Json) => i.itemId === itemA.id);
    const lineB = receipt.items.find((i: Json) => i.itemId === itemB.id);
    const r2 = (await post(csToken, `/inventory/goods-receipts/${receipt.id}/receive`, { lines: [{ receiptItemId: lineB.id, quantity: 4 }, { receiptItemId: lineA.id, quantity: 1 }] }).expect(201)).body as Json;
    expect(r2.status).toBe('PARTIALLY_RECEIVED'); // 纸巾还差 3 箱
    const r3 = (await post(csToken, `/inventory/goods-receipts/${receipt.id}/receive`, { expressNo: 'ZT222', lines: [{ receiptItemId: lineA.id, quantity: 3 }] }).expect(201)).body as Json;
    expect(r3.status).toBe('COMPLETED');
    expect(r3.completedAt).toBeTruthy();
    expect(r3.confirmations).toHaveLength(3);
    expect(await stockQty(itemA.id)).toBe(10);
    expect(await stockQty(itemB.id)).toBe(4);
    const stockA = await prisma.warehouseStock.findUniqueOrThrow({ where: { warehouseId_itemId: { warehouseId, itemId: itemA.id } } });
    expect(stockA.avgCost).toBe(2000); // 20 元 = 2000 分
    expect((await get(csToken, `/inventory/purchase-orders/${order.id}`).expect(200)).body.status).toBe('COMPLETED');
    expect((await todos(csToken)).items.some((i: Json) => i.kind === 'RECEIVE' && i.title.includes(receipt.receiptNo))).toBe(false);
    await post(csToken, `/inventory/goods-receipts/${receipt.id}/receive`, { lines: [{ receiptItemId: lineA.id, quantity: 1 }] }).expect(400); // 已完成不能再收
  });

  it('8. 个别货不来了：已收一部分后可“结束收货”（必须写原因）；一件没收的采购单取消会同时作废入库单；已有收货的不能取消', async () => {
    const mk = async (qty: number) => {
      const o = (await post(adminToken, '/inventory/purchase-orders', { storeId, warehouseId, supplierId, items: [{ itemId: itemB.id, quantity: qty, unitPrice: 3000 }] }).expect(201)).body as Json;
      await prisma.purchaseOrder.update({ where: { id: o.id }, data: { status: 'APPROVED' } }); // 手工采购单走审批；这里直接置为待采购，专注测收货
      const fresh = (await get(buyerToken, `/inventory/purchase-orders/${o.id}`).expect(200)).body as Json;
      const r = (await post(buyerToken, `/inventory/purchase-orders/${o.id}/confirm-purchase`, { version: fresh.version }).expect(201)).body as Json;
      return { order: r.order as Json, receipt: (await get(csToken, `/inventory/goods-receipts/${r.receipt.id}`).expect(200)).body as Json };
    };
    // a) 一件没收：取消采购单，入库单跟着作废
    const a = await mk(5);
    await post(buyerToken, `/inventory/purchase-orders/${a.order.id}/cancel`, { cancelReason: '供应商缺货', version: a.order.version }).expect(201);
    expect((await get(csToken, `/inventory/goods-receipts/${a.receipt.id}`).expect(200)).body.status).toBe('CANCELLED');
    // b) 收了一部分后：不能取消采购单；“结束收货”要写原因
    const b = await mk(5);
    await post(csToken, `/inventory/goods-receipts/${b.receipt.id}/receive`, { lines: [{ receiptItemId: b.receipt.items[0].id, quantity: 2 }] }).expect(201);
    const cur = (await get(buyerToken, `/inventory/purchase-orders/${b.order.id}`).expect(200)).body as Json;
    await post(buyerToken, `/inventory/purchase-orders/${b.order.id}/cancel`, { cancelReason: 'x', version: cur.version }).expect(400);
    await post(csToken, `/inventory/goods-receipts/${b.receipt.id}/close-short`, { reason: '' }).expect(400);
    const closed = (await post(csToken, `/inventory/goods-receipts/${b.receipt.id}/close-short`, { reason: '供应商缺货，剩余 3 桶退款' }).expect(201)).body as Json;
    expect(closed).toMatchObject({ status: 'COMPLETED', shortClosedNote: '供应商缺货，剩余 3 桶退款' });
    expect((await get(csToken, `/inventory/purchase-orders/${b.order.id}`).expect(200)).body.status).toBe('COMPLETED');
    // 一件没收的不能“结束收货”
    const c = await mk(2);
    await post(csToken, `/inventory/goods-receipts/${c.receipt.id}/close-short`, { reason: '测试' }).expect(400);
  });

  it('9. 汇总申购单作废：被汇总的部门申购单放回“待汇总”，可重新汇总；部门负责人能撤回已提交未汇总的申购单', async () => {
    const d2 = (await post(headToken, '/inventory/purchase-requests/department', { submit: true, items: [{ name: itemB.name, quantity: 2, unit: '桶' }] }).expect(201)).body as Json;
    const s2 = (await post(csToken, '/inventory/purchase-requests/collect', { ids: [d2.id] }).expect(201)).body as Json;
    await post(csToken, `/inventory/purchase-requests/${s2.id}/cancel`, { cancelReason: '重新汇总', version: s2.version }).expect(201);
    const back = (await get(headToken, `/inventory/purchase-requests/${d2.id}`).expect(200)).body as Json;
    expect(back).toMatchObject({ status: 'SUBMITTED', summaryRequestId: null });
    // 撤回
    const recalled = (await post(headToken, `/inventory/purchase-requests/${d2.id}/recall`, { version: back.version }).expect(201)).body as Json;
    expect(recalled.status).toBe('DRAFT');
    // 草稿状态客服看不到（部门负责人还在改）
    const csList = (await get(csToken, '/inventory/purchase-requests').query({ kind: 'DEPARTMENT' }).expect(200)).body as Json[];
    expect(csList.some((r) => r.id === d2.id)).toBe(false);
  });
});
