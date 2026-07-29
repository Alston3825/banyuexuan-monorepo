import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import type {
  GoodsReceipt,
  InventoryItem,
  PurchaseOrder,
  StockBatch,
  StockCount,
  StockIssue,
  StockTransfer,
  Supplier,
  Warehouse,
  WarehouseStock,
  WorkflowInstance,
} from '@prisma/client';
import { AppModule } from '../src/app.module';

/**
 * P3 库存域第一切片端到端集成测试：主数据(供应商/仓库/物品) -> 采购单(始终走审批)
 * -> 入库单(挂已批采购单跳过自身审批 / 独立入库按仓库免审批配置) -> 移动加权平均成本
 * -> 出库/领用单(FEFO批次扣减) -> 调拨单(跨仓库，源仓库配置决定审批) -> 盘点单(盈亏调整)
 * -> 低库存预警 + 过期预警。
 *
 * 业务规则依据：docs/竞品分析-一月妈咪月子中心管理系统功能架构逆向分析.md 3.7 节 +
 * docs/业务规则确认记录.md「2026-07-29 P3库存域启动」章节的范围收窄记录。
 * 审批复用通用工作流引擎，风格与 p1-core-flow.e2e-spec.ts 的 CONTRACT/PAYMENT 审批测试一致——
 * STORE_MANAGER 角色由 store_manager 与 test_user 两个账号共同持有，需要两者都批准同一节点。
 */
describe('P3 库存域：主数据+采购入库+出库领用+调拨+盘点+预警 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;

  const SEED_PASSWORD = 'Passw0rd!23';
  const runTag = Date.now().toString().slice(-8);

  let adminToken: string;
  let storeManagerToken: string;
  let otherStoreManagerToken: string;
  let storeId: string;

  function authed(token: string) {
    return { Authorization: `Bearer ${token}` };
  }
  function body<T>(res: request.Response): T {
    return res.body as T;
  }
  interface LoginResponse {
    accessToken: string;
  }

  let supplierId: string;
  let warehouseAId: string; // 需审批
  let warehouseBId: string; // 免审批
  let item1Id: string; // 鸡蛋：安全库存阈值10，保质期3天
  let item2Id: string; // 大米：无阈值、无保质期

  let purchaseOrderId: string;
  let receipt1Id: string; // 挂在已批采购单下
  let receipt2Id: string; // 独立入库（仓库B免审批）
  let receipt3Id: string; // 独立入库（仓库A需审批）
  let issue1Id: string;
  let transferId: string;
  let countId: string;

  async function approveByBothStoreManagers(instanceId: string) {
    await request(server).post(`/api/v1/workflow/instances/${instanceId}/approve`).set(authed(storeManagerToken)).send({ comment: '同意' }).expect(201);
    await request(server)
      .post(`/api/v1/workflow/instances/${instanceId}/approve`)
      .set(authed(otherStoreManagerToken))
      .send({ comment: '（另一门店店长）一并批准' })
      .expect(201);
  }

  async function findInstanceId(businessType: string, businessId: string): Promise<string> {
    const res = await request(server)
      .get('/api/v1/workflow/instances')
      .query({ businessType, businessId })
      .set(authed(adminToken))
      .expect(200);
    return body<WorkflowInstance>(res).id;
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
    const storeManagerLogin = await request(server)
      .post('/api/v1/auth/login')
      .send({ username: 'store_manager', password: SEED_PASSWORD })
      .expect(201);
    storeManagerToken = body<LoginResponse>(storeManagerLogin).accessToken;
    const otherLogin = await request(server).post('/api/v1/auth/login').send({ username: 'test_user', password: SEED_PASSWORD }).expect(201);
    otherStoreManagerToken = body<LoginResponse>(otherLogin).accessToken;

    const stores = await request(server).get('/api/v1/platform/stores').set(authed(adminToken)).expect(200);
    storeId = body<{ id: string }[]>(stores)[0].id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ==================== 主数据 ====================

  it('1. 创建供应商', async () => {
    const res = await request(server)
      .post('/api/v1/inventory/suppliers')
      .set(authed(adminToken))
      .send({ code: `sup_${runTag}`, name: 'E2E测试供应商' })
      .expect(201);
    supplierId = body<Supplier>(res).id;
  });

  it('2. 创建仓库：一个需审批，一个免审批', async () => {
    const a = await request(server)
      .post('/api/v1/inventory/warehouses')
      .set(authed(adminToken))
      .send({ storeId, code: `wha_${runTag}`, name: 'E2E主仓库(需审批)', requiresApproval: true })
      .expect(201);
    warehouseAId = body<Warehouse>(a).id;

    const b = await request(server)
      .post('/api/v1/inventory/warehouses')
      .set(authed(adminToken))
      .send({ storeId, code: `whb_${runTag}`, name: 'E2E分仓库(免审批)', requiresApproval: false })
      .expect(201);
    warehouseBId = body<Warehouse>(b).id;
  });

  it('3. 创建物品：鸡蛋(安全库存10/保质期3天)、大米(无阈值)', async () => {
    const item1 = await request(server)
      .post('/api/v1/inventory/items')
      .set(authed(adminToken))
      .send({ code: `egg_${runTag}`, name: '鸡蛋', unit: 'kg', safetyStockThreshold: 10, shelfLifeDays: 3 })
      .expect(201);
    item1Id = body<InventoryItem>(item1).id;

    const item2 = await request(server)
      .post('/api/v1/inventory/items')
      .set(authed(adminToken))
      .send({ code: `rice_${runTag}`, name: '大米', unit: 'kg' })
      .expect(201);
    item2Id = body<InventoryItem>(item2).id;
  });

  // ==================== 采购单：始终走审批 ====================

  it('4. 创建采购单：DRAFT，总金额自动汇总', async () => {
    const res = await request(server)
      .post('/api/v1/inventory/purchase-orders')
      .set(authed(adminToken))
      .send({ storeId, warehouseId: warehouseAId, supplierId, items: [{ itemId: item1Id, quantity: 100, unitPrice: 500 }] })
      .expect(201);
    purchaseOrderId = body<PurchaseOrder>(res).id;
    expect(body<PurchaseOrder>(res).status).toBe('DRAFT');
    expect(body<PurchaseOrder>(res).totalAmount).toBe(50000);
  });

  it('5. 提交采购单：进入PENDING_APPROVAL，双店长审批后懒同步为APPROVED', async () => {
    const submitted = await request(server)
      .post(`/api/v1/inventory/purchase-orders/${purchaseOrderId}/submit`)
      .set(authed(adminToken))
      .send({ version: 0 })
      .expect(201);
    expect(body<PurchaseOrder>(submitted).status).toBe('PENDING_APPROVAL');

    const instanceId = await findInstanceId('PURCHASE_ORDER', purchaseOrderId);
    await approveByBothStoreManagers(instanceId);

    const reconciled = await request(server).get(`/api/v1/inventory/purchase-orders/${purchaseOrderId}`).set(authed(adminToken)).expect(200);
    expect(body<PurchaseOrder>(reconciled).status).toBe('APPROVED');
  });

  // ==================== 入库单 ====================

  it('6. 挂在已批采购单下的入库单：提交时跳过审批，直接APPROVED', async () => {
    const created = await request(server)
      .post('/api/v1/inventory/goods-receipts')
      .set(authed(adminToken))
      .send({ storeId, warehouseId: warehouseAId, purchaseOrderId, items: [{ itemId: item1Id, quantity: 100, unitCost: 500 }] })
      .expect(201);
    receipt1Id = body<GoodsReceipt>(created).id;

    const submitted = await request(server)
      .post(`/api/v1/inventory/goods-receipts/${receipt1Id}/submit`)
      .set(authed(adminToken))
      .send({ version: 0 })
      .expect(201);
    expect(body<GoodsReceipt>(submitted).status).toBe('APPROVED');
  });

  it('7. 执行入库单：生成库存汇总(quantity=100,avgCost=500)与批次(expiresAt=+3天)', async () => {
    const executed = await request(server)
      .post(`/api/v1/inventory/goods-receipts/${receipt1Id}/execute`)
      .set(authed(adminToken))
      .send({ version: 1 })
      .expect(201);
    expect(body<GoodsReceipt>(executed).status).toBe('COMPLETED');

    const stocks = await request(server)
      .get('/api/v1/inventory/warehouse-stocks')
      .query({ warehouseId: warehouseAId, itemId: item1Id })
      .set(authed(adminToken))
      .expect(200);
    expect(body<WarehouseStock[]>(stocks)[0].quantity).toBe(100);
    expect(body<WarehouseStock[]>(stocks)[0].avgCost).toBe(500);

    const batches = await request(server)
      .get('/api/v1/inventory/stock-batches')
      .query({ warehouseId: warehouseAId, itemId: item1Id })
      .set(authed(adminToken))
      .expect(200);
    expect(body<StockBatch[]>(batches)).toHaveLength(1);
    expect(body<StockBatch[]>(batches)[0].quantity).toBe(100);
  });

  it('8. 独立入库单（免审批仓库B）：提交后直接APPROVED，无需工作流', async () => {
    const created = await request(server)
      .post('/api/v1/inventory/goods-receipts')
      .set(authed(adminToken))
      .send({ storeId, warehouseId: warehouseBId, items: [{ itemId: item2Id, quantity: 20, unitCost: 300 }] })
      .expect(201);
    receipt2Id = body<GoodsReceipt>(created).id;

    const submitted = await request(server)
      .post(`/api/v1/inventory/goods-receipts/${receipt2Id}/submit`)
      .set(authed(adminToken))
      .send({ version: 0 })
      .expect(201);
    expect(body<GoodsReceipt>(submitted).status).toBe('APPROVED');

    await request(server).post(`/api/v1/inventory/goods-receipts/${receipt2Id}/execute`).set(authed(adminToken)).send({ version: 1 }).expect(201);
  });

  it('9. 独立入库单（需审批仓库A，第二次进货不同单价）：移动加权平均成本正确计算', async () => {
    const created = await request(server)
      .post('/api/v1/inventory/goods-receipts')
      .set(authed(adminToken))
      .send({ storeId, warehouseId: warehouseAId, items: [{ itemId: item1Id, quantity: 50, unitCost: 800 }] })
      .expect(201);
    receipt3Id = body<GoodsReceipt>(created).id;

    const submitted = await request(server)
      .post(`/api/v1/inventory/goods-receipts/${receipt3Id}/submit`)
      .set(authed(adminToken))
      .send({ version: 0 })
      .expect(201);
    expect(body<GoodsReceipt>(submitted).status).toBe('PENDING_APPROVAL');
    const instanceId = await findInstanceId('GOODS_RECEIPT', receipt3Id);
    await approveByBothStoreManagers(instanceId);

    const reconciled = await request(server).get(`/api/v1/inventory/goods-receipts/${receipt3Id}`).set(authed(adminToken)).expect(200);
    expect(body<GoodsReceipt>(reconciled).status).toBe('APPROVED');

    await request(server)
      .post(`/api/v1/inventory/goods-receipts/${receipt3Id}/execute`)
      .set(authed(adminToken))
      .send({ version: body<GoodsReceipt>(reconciled).version })
      .expect(201);

    const stocks = await request(server)
      .get('/api/v1/inventory/warehouse-stocks')
      .query({ warehouseId: warehouseAId, itemId: item1Id })
      .set(authed(adminToken))
      .expect(200);
    // (100*500 + 50*800) / 150 = 600
    expect(body<WarehouseStock[]>(stocks)[0].quantity).toBe(150);
    expect(body<WarehouseStock[]>(stocks)[0].avgCost).toBe(600);
  });

  // ==================== 出库/领用单 ====================

  it('10. 出库单：库存不足时创建应被拒绝', async () => {
    const res = await request(server)
      .post('/api/v1/inventory/stock-issues')
      .set(authed(adminToken))
      .send({ storeId, warehouseId: warehouseAId, issueType: 'REQUISITION', items: [{ itemId: item1Id, quantity: 200 }] })
      .expect(400);
    expect(body<{ message: string }>(res).message).toContain('库存不足');
  });

  it('11. 出库单：提交审批+执行后按FEFO扣减批次，avgCost不变', async () => {
    const created = await request(server)
      .post('/api/v1/inventory/stock-issues')
      .set(authed(adminToken))
      .send({ storeId, warehouseId: warehouseAId, issueType: 'REQUISITION', remark: '护理部领用', items: [{ itemId: item1Id, quantity: 145 }] })
      .expect(201);
    issue1Id = body<StockIssue>(created).id;

    const submitted = await request(server)
      .post(`/api/v1/inventory/stock-issues/${issue1Id}/submit`)
      .set(authed(adminToken))
      .send({ version: 0 })
      .expect(201);
    expect(body<StockIssue>(submitted).status).toBe('PENDING_APPROVAL');
    const instanceId = await findInstanceId('STOCK_ISSUE', issue1Id);
    await approveByBothStoreManagers(instanceId);

    const reconciled = await request(server).get(`/api/v1/inventory/stock-issues/${issue1Id}`).set(authed(adminToken)).expect(200);
    expect(body<StockIssue>(reconciled).status).toBe('APPROVED');
    await request(server)
      .post(`/api/v1/inventory/stock-issues/${issue1Id}/execute`)
      .set(authed(adminToken))
      .send({ version: body<StockIssue>(reconciled).version })
      .expect(201);

    const stocks = await request(server)
      .get('/api/v1/inventory/warehouse-stocks')
      .query({ warehouseId: warehouseAId, itemId: item1Id })
      .set(authed(adminToken))
      .expect(200);
    expect(body<WarehouseStock[]>(stocks)[0].quantity).toBe(5);
    expect(body<WarehouseStock[]>(stocks)[0].avgCost).toBe(600);

    const batches = await request(server)
      .get('/api/v1/inventory/stock-batches')
      .query({ warehouseId: warehouseAId, itemId: item1Id })
      .set(authed(adminToken))
      .expect(200);
    // 先批次(qty100,先到期)被完全消耗掉出列表(quantity>0过滤)，只剩后一批次的残余 100+50-145=5
    expect(body<StockBatch[]>(batches)).toHaveLength(1);
    expect(body<StockBatch[]>(batches)[0].quantity).toBe(5);
  });

  it('12. 低库存预警：鸡蛋在仓库A的剩余量(5)低于安全库存阈值(10)', async () => {
    const alerts = await request(server)
      .get('/api/v1/inventory/warehouse-stocks/low-stock-alerts')
      .query({ warehouseId: warehouseAId })
      .set(authed(adminToken))
      .expect(200);
    const list = body<WarehouseStock[]>(alerts);
    expect(list.some((s) => s.itemId === item1Id)).toBe(true);
  });

  it('13. 过期预警：鸡蛋批次3天保质期，30天窗口内应能查到', async () => {
    const alerts = await request(server)
      .get('/api/v1/inventory/stock-batches/expiry-alerts')
      .query({ warehouseId: warehouseAId, withinDays: 30 })
      .set(authed(adminToken))
      .expect(200);
    const list = body<(StockBatch & { isExpired: boolean })[]>(alerts);
    expect(list.some((b) => b.itemId === item1Id)).toBe(true);
  });

  // ==================== 调拨单（跨仓库） ====================

  it('14. 调拨单：从仓库A调拨大米到仓库B，源仓库A需审批则走工作流', async () => {
    // 先给仓库A备一批"大米"库存（不挂采购单，直接审批入库）。
    const receipt = await request(server)
      .post('/api/v1/inventory/goods-receipts')
      .set(authed(adminToken))
      .send({ storeId, warehouseId: warehouseAId, items: [{ itemId: item2Id, quantity: 20, unitCost: 300 }] })
      .expect(201);
    const receiptId = body<GoodsReceipt>(receipt).id;
    const receiptSubmitted = await request(server).post(`/api/v1/inventory/goods-receipts/${receiptId}/submit`).set(authed(adminToken)).send({ version: 0 }).expect(201);
    expect(body<GoodsReceipt>(receiptSubmitted).status).toBe('PENDING_APPROVAL');
    const receiptInstanceId = await findInstanceId('GOODS_RECEIPT', receiptId);
    await approveByBothStoreManagers(receiptInstanceId);
    const receiptReconciled = await request(server).get(`/api/v1/inventory/goods-receipts/${receiptId}`).set(authed(adminToken)).expect(200);
    await request(server)
      .post(`/api/v1/inventory/goods-receipts/${receiptId}/execute`)
      .set(authed(adminToken))
      .send({ version: body<GoodsReceipt>(receiptReconciled).version })
      .expect(201);

    const created = await request(server)
      .post('/api/v1/inventory/stock-transfers')
      .set(authed(adminToken))
      .send({ fromWarehouseId: warehouseAId, toWarehouseId: warehouseBId, items: [{ itemId: item2Id, quantity: 8 }] })
      .expect(201);
    transferId = body<StockTransfer>(created).id;

    const submitted = await request(server)
      .post(`/api/v1/inventory/stock-transfers/${transferId}/submit`)
      .set(authed(adminToken))
      .send({ version: 0 })
      .expect(201);
    expect(body<StockTransfer>(submitted).status).toBe('PENDING_APPROVAL');
    const instanceId = await findInstanceId('STOCK_TRANSFER', transferId);
    await approveByBothStoreManagers(instanceId);

    const transferReconciled = await request(server).get(`/api/v1/inventory/stock-transfers/${transferId}`).set(authed(adminToken)).expect(200);
    expect(body<StockTransfer>(transferReconciled).status).toBe('APPROVED');
    await request(server)
      .post(`/api/v1/inventory/stock-transfers/${transferId}/execute`)
      .set(authed(adminToken))
      .send({ version: body<StockTransfer>(transferReconciled).version })
      .expect(201);

    const fromStocks = await request(server)
      .get('/api/v1/inventory/warehouse-stocks')
      .query({ warehouseId: warehouseAId, itemId: item2Id })
      .set(authed(adminToken))
      .expect(200);
    expect(body<WarehouseStock[]>(fromStocks)[0].quantity).toBe(12);
    expect(body<WarehouseStock[]>(fromStocks)[0].avgCost).toBe(300);

    const toStocks = await request(server)
      .get('/api/v1/inventory/warehouse-stocks')
      .query({ warehouseId: warehouseBId, itemId: item2Id })
      .set(authed(adminToken))
      .expect(200);
    // 仓库B在测试8已有20个大米(单价300)，调拨新增8个(源仓库当时均价也是300)，20+8=28，均价仍是300。
    expect(body<WarehouseStock[]>(toStocks)[0].quantity).toBe(28);
    expect(body<WarehouseStock[]>(toStocks)[0].avgCost).toBe(300);
  });

  // ==================== 盘点单 ====================

  it('15. 盘点单：一次性覆盖盘盈(鸡蛋)与盘亏(大米)两种场景', async () => {
    const created = await request(server)
      .post('/api/v1/inventory/stock-counts')
      .set(authed(adminToken))
      .send({
        storeId,
        warehouseId: warehouseBId,
        items: [
          { itemId: item1Id, countedQuantity: 25 }, // 系统0(仓库B从未有鸡蛋) -> 盘盈+25
          { itemId: item2Id, countedQuantity: 26 }, // 系统28(测试8的20+测试14调拨的8) -> 盘亏-2
        ],
      })
      .expect(201);
    countId = body<StockCount>(created).id;
    const items = body<StockCount & { items: { itemId: string; systemQuantity: number; countedQuantity: number; diffQuantity: number }[] }>(created).items;
    expect(items.find((i) => i.itemId === item1Id)!.diffQuantity).toBe(25);
    expect(items.find((i) => i.itemId === item2Id)!.diffQuantity).toBe(-2);

    // 仓库B免审批，提交后直接APPROVED。
    const submitted = await request(server).post(`/api/v1/inventory/stock-counts/${countId}/submit`).set(authed(adminToken)).send({ version: 0 }).expect(201);
    expect(body<StockCount>(submitted).status).toBe('APPROVED');

    await request(server).post(`/api/v1/inventory/stock-counts/${countId}/execute`).set(authed(adminToken)).send({ version: 1 }).expect(201);

    const item1Stocks = await request(server)
      .get('/api/v1/inventory/warehouse-stocks')
      .query({ warehouseId: warehouseBId, itemId: item1Id })
      .set(authed(adminToken))
      .expect(200);
    expect(body<WarehouseStock[]>(item1Stocks)[0].quantity).toBe(25);

    const item2Stocks = await request(server)
      .get('/api/v1/inventory/warehouse-stocks')
      .query({ warehouseId: warehouseBId, itemId: item2Id })
      .set(authed(adminToken))
      .expect(200);
    expect(body<WarehouseStock[]>(item2Stocks)[0].quantity).toBe(26);
  });

  // ==================== 取消 / 乐观锁 / 权限 ====================

  it('16. 采购单：错误版本号提交应返回409；PENDING_APPROVAL之外的状态不允许取消', async () => {
    const created = await request(server)
      .post('/api/v1/inventory/purchase-orders')
      .set(authed(adminToken))
      .send({ storeId, warehouseId: warehouseAId, supplierId, items: [{ itemId: item1Id, quantity: 10, unitPrice: 500 }] })
      .expect(201);
    const id = body<PurchaseOrder>(created).id;

    await request(server).post(`/api/v1/inventory/purchase-orders/${id}/submit`).set(authed(adminToken)).send({ version: 9 }).expect(409);

    const cancelled = await request(server)
      .post(`/api/v1/inventory/purchase-orders/${id}/cancel`)
      .set(authed(adminToken))
      .send({ cancelReason: '不再需要', version: 0 })
      .expect(201);
    expect(body<PurchaseOrder>(cancelled).status).toBe('CANCELLED');

    await request(server).post(`/api/v1/inventory/purchase-orders/${id}/submit`).set(authed(adminToken)).send({ version: 1 }).expect(400);
  });

  it('17. 权限隔离：店长不可配置物品（主数据），但可创建仓库与采购单（日常操作）', async () => {
    await request(server)
      .post('/api/v1/inventory/items')
      .set(authed(storeManagerToken))
      .send({ code: `sm_${runTag}`, name: 'x', unit: '个' })
      .expect(403);

    await request(server)
      .post('/api/v1/inventory/warehouses')
      .set(authed(storeManagerToken))
      .send({ storeId, code: `sm_wh_${runTag}`, name: '店长自建仓库' })
      .expect(201);

    await request(server).get('/api/v1/inventory/purchase-orders').set(authed(storeManagerToken)).expect(200);
  });
});
