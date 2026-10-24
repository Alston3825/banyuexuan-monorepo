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
    const login = async (u: string) => ((await request(server).post('/api/v1/auth/login').send({ username: u, password: 'Passw0rd!23' }).expect(201)).body as Json).accessToken as string;
    token = await login('admin');
    const storeId = ((await request(server).get('/api/v1/platform/stores').set(authed()).expect(200)).body as Json[]).find((s) => s.name.includes('示例店'))!.id;
    const warehouseId = ((await request(server).post('/api/v1/inventory/warehouses').set(authed()).send({ storeId, code: `i88wh_${tag}`, name: `导入仓库${tag}`, requiresApproval: false }).expect(201)).body as Json).id;
    const mk = async (key: string, supplierName: string, itemName: string, qty: number, price: number) => {
      const supplierId = ((await request(server).post('/api/v1/inventory/suppliers').set(authed()).send({ code: `i88s_${key}_${tag}`, name: supplierName }).expect(201)).body as Json).id;
      const itemId = ((await request(server).post('/api/v1/inventory/items').set(authed()).send({ code: `i88i_${key}_${tag}`, name: itemName, unit: '件' }).expect(201)).body as Json).id;
      const id = ((await request(server).post('/api/v1/inventory/purchase-orders').set(authed()).send({ storeId, warehouseId, supplierId, items: [{ itemId, quantity: qty, unitPrice: price }] }).expect(201)).body as Json).id as string;
      await prisma.purchaseOrder.update({ where: { id }, data: { status: 'PURCHASED', purchasedAt: new Date() } });
      poIds[key] = id;
    };
    await mk('A', '松洋包装', '保鲜膜', 30, 1700); // 51000 分
    await mk('B', '鑫鑫日化', '洗洁精', 2, 5700); // 11400 分
    await mk('C', '不相干商贸', '办公椅', 1, 99900);
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    await app.close();
  });

  it('1. 快递公司名 → 快递100编码', () => {
    expect(companyCodeOf('申通快递(STO)')).toBe('shentong');
    expect(companyCodeOf('中通快运')).toBe('zhongtongkuaiyun');
    expect(companyCodeOf('中通快递(ZTO)')).toBe('zhongtong');
    expect(companyCodeOf('邮政国内小包')).toBe('youzhengguonei');
    expect(companyCodeOf('某某物流')).toBeNull();
  });

  it('2. 预览：金额+供应商+货品都对得上的放心配；只有名字像的请核对；没对上的不乱配', async () => {
    jest.spyOn(PurchaseOrder1688ImportService.prototype, 'parse').mockReturnValue([
      order({ orderNo: `9001${tag}`, seller: '广州松洋包装材料有限公司', goodsTotal: 534, paid: 510, titles: ['保鲜膜商用大卷美容院超市通用食品级'], expressCompanyRaw: '申通快递(STO)', expressCompany: 'shentong', expressNos: ['773447881632692'] }),
      order({ orderNo: `9002${tag}`, seller: '某某清洁用品厂', goodsTotal: 114, paid: 114, titles: ['50斤洗洁精大桶装商用餐饮'], expressCompanyRaw: '中通快运', expressCompany: 'zhongtongkuaiyun', expressNos: ['302386666824', '302386666825'] }),
      order({ orderNo: `9003${tag}`, seller: '完全无关公司', goodsTotal: 7777, paid: 7777, titles: ['火箭发动机'], expressNos: [] }),
    ]);
    const res = (await request(server).post('/api/v1/inventory/purchase-orders/import-1688/preview').set(authed()).attach('file', Buffer.from('x'), 'a.xlsx').expect(201)).body as Json;
    const by = (n: string) => (res.rows as Json[]).find((r) => r.order.orderNo === `${n}${tag}`)!;
    expect(by('9001')).toMatchObject({ confidence: 'high', match: { id: poIds.A } });
    expect(by('9002')).toMatchObject({ confidence: 'high', match: { id: poIds.B } });
    expect(by('9002').notes.join()).toContain('2 个运单号');
    expect(by('9003')).toMatchObject({ confidence: 'none', match: null });
    expect(by('9003').notes.join()).toContain('没有运单号');
    // 采购单C没被乱配
    expect((res.rows as Json[]).some((r) => r.match?.id === poIds.C)).toBe(false);
  });

  it('3. 确认登记：写入平台/订单号/快递公司/运单号，多余运单号进备注；重复订单号、重复采购单被拒；没登录的不行', async () => {
    const no = `9001${tag}`;
    const r = (
      await request(server)
        .post('/api/v1/inventory/purchase-orders/import-1688/commit')
        .set(authed())
        .send({ items: [{ purchaseOrderId: poIds.A, platformOrderNo: no, expressNo: '773447881632692', expressCompany: 'shentong' }, { purchaseOrderId: poIds.B, platformOrderNo: `9002${tag}`, expressNo: '302386666824', expressCompany: 'zhongtongkuaiyun', extraExpressNos: ['302386666825'] }] })
        .expect(201)
    ).body as Json;
    expect(r.okCount).toBe(2);
    const a = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: poIds.A } });
    expect(a).toMatchObject({ platform: '1688', platformOrderNo: no, expressNo: '773447881632692', expressCompany: 'shentong' });
    const b = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: poIds.B } });
    expect(b.purchaseNote).toContain('302386666825');
    // 同一张 1688 订单登记到另一张采购单 → 拒绝
    const dup = (await request(server).post('/api/v1/inventory/purchase-orders/import-1688/commit').set(authed()).send({ items: [{ purchaseOrderId: poIds.C, platformOrderNo: no }] }).expect(201)).body as Json;
    expect(dup.results[0].ok).toBe(false);
    expect(dup.results[0].error).toContain('已经登记');
    // 再次预览：已登记的订单被识别为“已关联”，运单号不变也不重复造
    jest.spyOn(PurchaseOrder1688ImportService.prototype, 'parse').mockReturnValue([order({ orderNo: no, seller: '松洋', goodsTotal: 534, paid: 510, titles: ['保鲜膜'], expressNos: ['773447881632692'] })]);
    const again = (await request(server).post('/api/v1/inventory/purchase-orders/import-1688/preview').set(authed()).attach('file', Buffer.from('x'), 'a.xlsx').expect(201)).body as Json;
    expect(again.rows[0]).toMatchObject({ alreadyLinked: true, confidence: 'high', match: { id: poIds.A } });
    await request(server).post('/api/v1/inventory/purchase-orders/import-1688/commit').send({ items: [] }).expect(401);
  });
});
