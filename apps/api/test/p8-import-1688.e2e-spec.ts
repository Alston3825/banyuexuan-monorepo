import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { Import1688Order, PurchaseOrder1688ImportService, companyCodeOf } from '../src/inventory/purchase-order/purchase-order-1688-import.service';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 导入 1688 订单表：智能对应采购单 + 登记平台订单号/运单号 */
describe('P8 导入 1688 订单 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let prisma: PrismaService;
  let token: string;
  const poIds: Record<string, string> = {};
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const tag = Date.now().toString().slice(-7);
  const authed = (t = token) => ({ Authorization: `Bearer ${t}` });
  const order = (o: Partial<Import1688Order>): Import1688Order => ({
    orderNo: '', seller: '', sellerMember: '', status: '等待买家确认收货', createdAt: new Date().toISOString(), goodsTotal: 0, freight: 0, paid: 0,
    titles: [], expressCompanyRaw: '', expressCompany: null, expressNos: [], ...o,
  });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    token = ((await request(server).post('/api/v1/auth/login').send({ username: 'admin', password: 'Passw0rd!23' }).expect(201)).body as Json).accessToken as string;
    const storeId = ((await request(server).get('/api/v1/platform/stores').set(authed()).expect(200)).body as Json[]).find((s) => s.name.includes('示例店'))!.id;
    const warehouseId = ((await request(server).post('/api/v1/inventory/warehouses').set(authed()).send({ storeId, code: `i88wh_${tag}`, name: `导入仓库${tag}`, requiresApproval: false }).expect(201)).body as Json).id;
    const mk = async (key: string, supplierName: string, lines: [string, number, number][]) => {
      const supplierId = ((await request(server).post('/api/v1/inventory/suppliers').set(authed()).send({ code: `i88s_${key}_${tag}`, name: supplierName }).expect(201)).body as Json).id;
      const items: Json[] = [];
      for (const [n, qty, price] of lines) {
        const itemId = ((await request(server).post('/api/v1/inventory/items').set(authed()).send({ code: `i88i_${key}_${n}_${tag}`, name: n, unit: '件' }).expect(201)).body as Json).id;
        items.push({ itemId, quantity: qty, unitPrice: price });
      }
      const id = ((await request(server).post('/api/v1/inventory/purchase-orders').set(authed()).send({ storeId, warehouseId, supplierId, items }).expect(201)).body as Json).id as string;
      await prisma.purchaseOrder.update({ where: { id }, data: { status: 'PURCHASED', purchasedAt: new Date() } });
      poIds[key] = id;
    };
    // A：一张采购单包含很多物品，对应 1688 上拆开下的好几笔订单（供应商只写“1688”）
    await mk('A', '1688', [['保鲜膜', 30, 1700], ['洗洁精', 2, 5700], ['办公椅子', 1, 99900]]);
    await mk('C', '不相干商贸', [['火箭模型', 1, 100]]);
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    await wait(300);
    await app.close();
  });

  it('1. 快递公司名 → 快递100编码', () => {
    expect(companyCodeOf('申通快递(STO)')).toBe('shentong');
    expect(companyCodeOf('中通快运')).toBe('zhongtongkuaiyun');
    expect(companyCodeOf('中通快递(ZTO)')).toBe('zhongtong');
    expect(companyCodeOf('邮政国内小包')).toBe('youzhengguonei');
    expect(companyCodeOf('某某物流')).toBeNull();
  });

  it('2. 预览：很多笔 1688 订单可以对应同一张采购单（按货品名），货品对不上的不乱配', async () => {
    jest.spyOn(PurchaseOrder1688ImportService.prototype, 'parse').mockReturnValue([
      order({ orderNo: `9001${tag}`, seller: '广州松洋包装材料有限公司', goodsTotal: 534, paid: 500, titles: ['保鲜膜商用大卷美容院超市通用食品级'], expressCompanyRaw: '申通快递(STO)', expressCompany: 'shentong', expressNos: ['773447881632692'] }),
      order({ orderNo: `9002${tag}`, seller: '某某清洁用品厂', goodsTotal: 114, paid: 114, titles: ['50斤洗洁精大桶装商用餐饮'], expressCompanyRaw: '中通快运', expressCompany: 'zhongtongkuaiyun', expressNos: ['302386666824', '302386666825'] }),
      order({ orderNo: `9003${tag}`, seller: '完全无关公司', goodsTotal: 7777, paid: 7777, titles: ['手机壳'], expressNos: [] }),
    ]);
    const res = (await request(server).post('/api/v1/inventory/purchase-orders/import-1688/preview').set(authed()).attach('file', Buffer.from('x'), 'a.xlsx').expect(201)).body as Json;
    const by = (n: string) => (res.rows as Json[]).find((r) => r.order.orderNo === `${n}${tag}`)!;
    expect(by('9001')).toMatchObject({ confidence: 'high', match: { id: poIds.A } });
    expect(by('9002')).toMatchObject({ confidence: 'high', match: { id: poIds.A } });
    expect(by('9002').notes.join()).toContain('2 个运单号');
    expect(by('9003')).toMatchObject({ confidence: 'none', match: null });
    expect(by('9003').notes.join()).toContain('没有运单号');
  });

  it('3. 确认登记：一张采购单下记多笔平台订单（每个运单号一条）；重复登记不重复；订单号不能挂到别的采购单', async () => {
    const o1 = `9001${tag}`;
    const o2 = `9002${tag}`;
    const body = {
      items: [
        { purchaseOrderId: poIds.A, platformOrderNo: o1, sellerName: '松洋', goodsTitle: '保鲜膜', paid: 500, orderStatus: '等待买家确认收货', expressCompany: 'shentong', expressNos: ['773447881632692'] },
        { purchaseOrderId: poIds.A, platformOrderNo: o2, sellerName: '清洁厂', goodsTitle: '洗洁精', paid: 114, expressCompany: 'zhongtongkuaiyun', expressNos: ['302386666824', '302386666825'] },
        { purchaseOrderId: poIds.A, platformOrderNo: `9004${tag}`, sellerName: '未发货店', goodsTitle: '椅子', paid: 10, expressNos: [] },
      ],
    };
    const r = (await request(server).post('/api/v1/inventory/purchase-orders/import-1688/commit').set(authed()).send(body).expect(201)).body as Json;
    expect(r.okCount).toBe(3);
    expect(await prisma.purchaseOrderShipment.count({ where: { purchaseOrderId: poIds.A } })).toBe(4); // 1 + 2 + 1(未发货占位)
    // 再登记一次：不重复；未发货的那笔补上运单号后占位记录消失
    body.items[2] = { purchaseOrderId: poIds.A, platformOrderNo: `9004${tag}`, sellerName: '未发货店', goodsTitle: '椅子', paid: 10, orderStatus: '', expressCompany: 'yunda', expressNos: ['435409131715611'] };
    await request(server).post('/api/v1/inventory/purchase-orders/import-1688/commit').set(authed()).send(body).expect(201);
    const rows = await prisma.purchaseOrderShipment.findMany({ where: { purchaseOrderId: poIds.A } });
    expect(rows).toHaveLength(4);
    expect(rows.every((x) => x.expressNo !== '')).toBe(true);
    expect(rows.find((x) => x.platformOrderNo === o1)).toMatchObject({ expressCompany: 'shentong', amount: 50000, sellerName: '松洋' });
    // 订单号已登记在A，不能再挂到C
    const dup = (await request(server).post('/api/v1/inventory/purchase-orders/import-1688/commit').set(authed()).send({ items: [{ purchaseOrderId: poIds.C, platformOrderNo: o1, expressNos: [] }] }).expect(201)).body as Json;
    expect(dup.results[0].ok).toBe(false);
    expect(dup.results[0].error).toContain('已经登记');
    // 明细接口
    const list = (await request(server).get(`/api/v1/inventory/purchase-orders/${poIds.A}/shipments`).set(authed()).expect(200)).body as Json[];
    expect(list).toHaveLength(4);
    expect(list[0]).toHaveProperty('expressCompanyName');
    // 再次预览：已登记的订单识别为“之前登记过”
    jest.spyOn(PurchaseOrder1688ImportService.prototype, 'parse').mockReturnValue([order({ orderNo: o1, seller: '松洋', goodsTotal: 534, paid: 500, titles: ['x'], expressNos: ['773447881632692'] })]);
    const again = (await request(server).post('/api/v1/inventory/purchase-orders/import-1688/preview').set(authed()).attach('file', Buffer.from('x'), 'a.xlsx').expect(201)).body as Json;
    expect(again.rows[0]).toMatchObject({ alreadyLinked: true, confidence: 'high', match: { id: poIds.A } });
    await request(server).post('/api/v1/inventory/purchase-orders/import-1688/commit').send({ items: [] }).expect(401);
  });
});
