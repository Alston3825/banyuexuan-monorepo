import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { existsSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * 纸质合同台账流程端到端测试：上传原件 -> AI 后台识别（mock 掉 ai-service）-> 核对保存 ->
 * 确认入库（关联/新建客户、定金生成收款）-> 待排房 -> 排房（预订记录带 contractId）-> 房态看板读取合同信息。
 * 用 global.fetch 模拟 ai-service 的 /contract/extract，不产生任何模型费用。
 * 注意：必须连独立测试库（DATABASE_URL 指向 banyuexuan_test），不要连存放真实数据的开发库。
 */
describe('P6 纸质合同台账 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let prisma: PrismaService;

  // 测试库里 admin 的密码取决于当初 seed 时的 SEED_DEV_PASSWORD；默认沿用其他 e2e 用的值，可用 E2E_SEED_PASSWORD 覆盖
  const SEED_PASSWORD = process.env.E2E_SEED_PASSWORD ?? 'Passw0rd!23';
  const runTag = Date.now().toString().slice(-8);
  const storageDir = path.join(os.tmpdir(), `contract-e2e-${runTag}`);

  let adminToken: string;
  let storeId: string;
  let tenantId: string;
  let roomTypeId: string;
  let roomId: string;

  const authed = (token: string) => ({ Authorization: `Bearer ${token}` });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Json = any;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /** ai-service /contract/extract 的模拟返回。 */
  function mockExtract(over: Record<string, unknown> = {}, warnings: unknown[] = []) {
    const data = {
      contract_no: `E2E-${runTag}`,
      signed_date: '2026-12-20',
      mother_name: 'E2E合同客户',
      id_card_no: '610113200008072621',
      phone: `139${runTag}`,
      hospital: '测试医院',
      address: '测试路1号',
      emergency_name: '联系人甲',
      emergency_relation: '夫妻',
      emergency_phone: '13200000000',
      fetus: 'single',
      due_date: '2027-03-21',
      room_type_text: `E2E房型${runTag}（南向）`,
      orientation: 'SOUTH',
      care_mode: 'ONE_TO_ONE',
      days_text: '28+28',
      in_house_days: 28,
      home_service_days: 28,
      package_amount: 19800,
      deposit_amount: 5940,
      gift_items: [
        { name: '产康盆底修复', quantity: '3次', needs_review: false, page: 2 },
        { name: '宝宝[?]', quantity: null, needs_review: true, page: 2 },
      ],
      extra_notes: [],
      ...over,
    };
    global.fetch = jest.fn(async () =>
      new Response(
        JSON.stringify({
          data,
          warnings,
          pages: [
            { index: 1, kind: 'cover', printed_page_no: null, source_name: 't.pdf', jpeg_b64: Buffer.from('fake-jpeg-1').toString('base64') },
            { index: 2, kind: 'body_1', printed_page_no: 1, source_name: 't.pdf', jpeg_b64: Buffer.from('fake-jpeg-2').toString('base64') },
          ],
          raw_pages: [],
          focus: null,
          focus_amounts: null,
          model: 'mock-model',
          latency_ms: 12,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as unknown as typeof fetch;
  }

  async function upload(name = 'contract.pdf'): Promise<Json> {
    const res = await request(server)
      .post('/api/v1/contract/records/upload')
      .set(authed(adminToken))
      .field('storeId', storeId)
      .attach('files', Buffer.from('%PDF-1.4 fake pdf body'), { filename: name, contentType: 'application/pdf' })
      .expect(201);
    return res.body;
  }

  async function waitExtracted(id: string): Promise<Json> {
    for (let i = 0; i < 60; i++) {
      const res = await request(server).get(`/api/v1/contract/records/${id}`).set(authed(adminToken)).expect(200);
      if (['DONE', 'FAILED'].includes(res.body.extractStatus)) return res.body;
      await sleep(200);
    }
    throw new Error('识别超时');
  }

  beforeAll(async () => {
    process.env.CONTRACT_STORAGE_DIR = storageDir;
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);

    const login = await request(server).post('/api/v1/auth/login').send({ username: 'admin', password: SEED_PASSWORD }).expect(201);
    adminToken = login.body.accessToken;
    const stores = await request(server).get('/api/v1/platform/stores').set(authed(adminToken)).expect(200);
    storeId = stores.body[0].id;
    tenantId = stores.body[0].tenantId;

    // 用于"房型原文 -> 系统房型"匹配；再建一间该房型的房间用来排房
    const rt = await prisma.roomType.create({
      data: { tenantId, code: `E2ERT${runTag}`, name: `E2E房型${runTag}`, standardPrice: 100000, createdBy: 'E2E' },
    });
    roomTypeId = rt.id;
    const room = await request(server)
      .post('/api/v1/room/rooms')
      .set(authed(adminToken))
      .send({ storeId, roomTypeId, roomNo: `E2E-${runTag}`, floor: '9F' })
      .expect(201);
    roomId = room.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  let c1: Json; // 第一份合同：新建客户 + 定金收款 + 排房
  let c2: Json; // 第二份合同：关联已有客户（补全空缺信息）

  it('1. 上传合同 -> 后台 AI 识别完成，识别结果按规则写进合同（预估入住 = 预产期 + 4 天）', async () => {
    mockExtract({}, [{ field: 'room_type_text', level: 'warn', message: '房型多次识别不一致', page: 2 }]);
    const created = await upload();
    expect(created.status).toBe('PENDING_REVIEW');
    expect(['PENDING', 'RUNNING']).toContain(created.extractStatus);
    expect(created.files.filter((f: Json) => f.kind === 'ORIGINAL')).toHaveLength(1);

    c1 = await waitExtracted(created.id);
    expect(c1.extractStatus).toBe('DONE');
    expect(c1.paperNo).toBe(`E2E-${runTag}`);
    expect(c1.clientName).toBe('E2E合同客户');
    expect(c1.careMode).toBe('ONE_TO_ONE');
    expect(c1.orientation).toBe('SOUTH');
    expect(c1.inHouseDays).toBe(28);
    expect(c1.homeServiceDays).toBe(28);
    expect(c1.amount).toBe(1980000);
    expect(c1.depositAmount).toBe(594000);
    expect(c1.estimatedCheckIn.slice(0, 10)).toBe('2027-03-25');
    expect(c1.estimatedCheckOut.slice(0, 10)).toBe('2027-04-22');
    expect(c1.roomTypeId).toBe(roomTypeId); // 手写房型原文里包含系统房型名 -> 自动匹配
    expect(c1.signerId).toBeTruthy(); // 签单人默认是上传人
    expect(c1.extractWarnings).toHaveLength(1);
    expect(c1.items).toHaveLength(2);
    expect(c1.items[1].needsReview).toBe(true); // 没看清的赠送项目要提示核对
    expect(c1.files.filter((f: Json) => f.kind === 'PAGE')).toHaveLength(2);
  });

  it('2. 逐页图片和原件可以取回（需要登录），原件保存在磁盘上', async () => {
    const page = c1.files.find((f: Json) => f.kind === 'PAGE');
    const res = await request(server)
      .get(`/api/v1/contract/records/${c1.id}/files/${page.id}`)
      .set(authed(adminToken))
      .buffer(true)
      .expect(200);
    expect(res.headers['content-type']).toContain('image/jpeg');
    expect(existsSync(path.join(storageDir, c1.id))).toBe(true);
    await request(server).get(`/api/v1/contract/records/${c1.id}/files/${page.id}`).expect(401);
  });

  it('3. 只接受 PDF / JPG / PNG；没选文件也拒绝', async () => {
    await request(server)
      .post('/api/v1/contract/records/upload')
      .set(authed(adminToken))
      .field('storeId', storeId)
      .attach('files', Buffer.from('hello'), { filename: 'a.txt', contentType: 'text/plain' })
      .expect(400);
    await request(server).post('/api/v1/contract/records/upload').set(authed(adminToken)).field('storeId', storeId).expect(400);
  });

  it('4. 确认入库（没有匹配客户时新建）：客户档案带上身份证/紧急联系人，勾选定金已收会生成收款记录', async () => {
    const matches = await request(server).get(`/api/v1/contract/records/${c1.id}/customer-matches`).set(authed(adminToken)).expect(200);
    expect(matches.body.matches).toHaveLength(0);

    const saved = await request(server)
      .patch(`/api/v1/contract/records/${c1.id}`)
      .set(authed(adminToken))
      .send({ version: c1.version, depositPaid: true, depositMethod: 'WECHAT', depositPaidAt: '2026-12-20' })
      .expect(200);
    const confirmed = await request(server)
      .post(`/api/v1/contract/records/${c1.id}/confirm`)
      .set(authed(adminToken))
      .send({ version: saved.body.version })
      .expect(201);
    expect(confirmed.body.status).toBe('ACTIVE');
    expect(confirmed.body.customerId).toBeTruthy();
    expect(confirmed.body.depositPaymentId).toBeTruthy();
    c1 = confirmed.body;

    const customer = await request(server).get(`/api/v1/crm/customers/${c1.customerId}`).set(authed(adminToken)).expect(200);
    expect(customer.body.name).toBe('E2E合同客户');
    expect(customer.body.idCardNo).toBe('610113200008072621'); // 身份证号不打码
    expect(customer.body.emergencyContactName).toBe('联系人甲');
    expect(customer.body.phone).toBe(`139${runTag}`);

    const payment = await prisma.payment.findUnique({ where: { id: c1.depositPaymentId } });
    expect(payment?.amount).toBe(594000);
    expect(payment?.method).toBe('WECHAT');
    expect(payment?.contractId).toBe(c1.id);
  });

  it('5. 确认后不能再次确认；已确认合同的金额和预估日期还能改（日期本来就是预估，常变动）', async () => {
    await request(server).post(`/api/v1/contract/records/${c1.id}/confirm`).set(authed(adminToken)).send({ version: c1.version }).expect(400);
    const res = await request(server)
      .patch(`/api/v1/contract/records/${c1.id}`)
      .set(authed(adminToken))
      .send({ version: c1.version, estimatedCheckIn: '2027-03-28' })
      .expect(200);
    expect(res.body.estimatedCheckOut.slice(0, 10)).toBe('2027-04-25'); // 离店随入住自动顺延
    c1 = res.body;
    // 过期版本号被拒绝（防止覆盖别人的修改）
    await request(server).patch(`/api/v1/contract/records/${c1.id}`).set(authed(adminToken)).send({ version: 0, amount: 1 }).expect(409);
  });

  it('6. 已确认、没排房的合同出现在待排房列表；排房（预订带 contractId）后从待排房移出，看板卡片读取合同信息', async () => {
    const before = await request(server).get('/api/v1/contract/records').query({ unassigned: true }).set(authed(adminToken)).expect(200);
    expect(before.body.some((x: Json) => x.id === c1.id)).toBe(true);

    const occ = await request(server)
      .post('/api/v1/room/occupancies')
      .set(authed(adminToken))
      .send({
        roomId,
        storeId,
        customerId: c1.customerId,
        contractId: c1.id,
        plannedCheckIn: '2027-03-28T00:00:00.000Z',
        plannedCheckOut: '2027-04-25T00:00:00.000Z',
      })
      .expect(201);

    const after = await request(server).get('/api/v1/contract/records').query({ unassigned: true }).set(authed(adminToken)).expect(200);
    expect(after.body.some((x: Json) => x.id === c1.id)).toBe(false);

    const board = await request(server)
      .get('/api/v1/room/rooms/board')
      .query({ storeId, date: '2027-04-01T00:00:00.000Z' })
      .set(authed(adminToken))
      .expect(200);
    const entry = board.body.find((e: Json) => e.room.id === roomId);
    expect(entry.status).toBe('RESERVED');
    expect(entry.contract.careMode).toBe('ONE_TO_ONE');
    expect(entry.contract.orientation).toBe('SOUTH');
    expect(entry.contract.inHouseDays).toBe(28);
    expect(entry.signerName).toBeTruthy();

    // 有未结束的预订时不能作废合同；取消预订后可以
    await request(server)
      .post(`/api/v1/contract/records/${c1.id}/void`)
      .set(authed(adminToken))
      .send({ voidReason: 'E2E', version: c1.version })
      .expect(409);
    await request(server)
      .post(`/api/v1/room/occupancies/${occ.body.id}/cancel`)
      .set(authed(adminToken))
      .send({ cancelReason: 'E2E', version: occ.body.version })
      .expect(201);
    const voided = await request(server)
      .post(`/api/v1/contract/records/${c1.id}/void`)
      .set(authed(adminToken))
      .send({ voidReason: 'E2E作废', version: c1.version })
      .expect(201);
    expect(voided.body.status).toBe('VOIDED');
  });

  it('7. 关联已有客户确认：只补全档案里的空缺（手机号占位、身份证），不覆盖已有信息', async () => {
    const existing = await request(server)
      .post('/api/v1/crm/customers')
      .set(authed(adminToken))
      .send({ name: 'E2E已有客户', phone: `137${runTag}`, source: 'WALK_IN', primaryStoreId: storeId, hospital: '原有医院' })
      .expect(201);
    // 模拟从房态表导入的老客户：手机号是"待补充"
    await prisma.customer.update({ where: { id: existing.body.id }, data: { phone: '待补充' } });

    mockExtract({ mother_name: 'E2E已有客户', phone: `136${runTag}`, hospital: '合同上的医院', contract_no: `E2E2-${runTag}` });
    const created = await upload('second.pdf');
    c2 = await waitExtracted(created.id);

    const matches = await request(server).get(`/api/v1/contract/records/${c2.id}/customer-matches`).set(authed(adminToken)).expect(200);
    expect(matches.body.matches.some((m: Json) => m.id === existing.body.id && m.reason === 'NAME')).toBe(true);

    const confirmed = await request(server)
      .post(`/api/v1/contract/records/${c2.id}/confirm`)
      .set(authed(adminToken))
      .send({ version: c2.version, customerId: existing.body.id })
      .expect(201);
    expect(confirmed.body.customerId).toBe(existing.body.id);

    const customer = await request(server).get(`/api/v1/crm/customers/${existing.body.id}`).set(authed(adminToken)).expect(200);
    expect(customer.body.phone).toBe(`136${runTag}`); // 占位手机号被真实号码补上
    expect(customer.body.idCardNo).toBe('610113200008072621');
    expect(customer.body.hospital).toBe('原有医院'); // 已有信息不覆盖
  });

  it('8. 只有还没确认的合同能删除（同时清掉磁盘上的原件）；确认过的只能作废', async () => {
    await request(server).delete(`/api/v1/contract/records/${c2.id}`).set(authed(adminToken)).expect(409);

    mockExtract({ contract_no: `E2E3-${runTag}` });
    const created = await upload('third.pdf');
    const c3 = await waitExtracted(created.id);
    expect(existsSync(path.join(storageDir, c3.id))).toBe(true);
    await request(server).delete(`/api/v1/contract/records/${c3.id}`).set(authed(adminToken)).expect(200);
    expect(existsSync(path.join(storageDir, c3.id))).toBe(false);
    await request(server).get(`/api/v1/contract/records/${c3.id}`).set(authed(adminToken)).expect(404);
  });

  it('9. AI 服务不可用时：合同保留，标记识别失败，可手工录入或重新识别', async () => {
    global.fetch = jest.fn(async () => new Response('down', { status: 503 })) as unknown as typeof fetch;
    const created = await upload('fail.pdf');
    const failed = await waitExtracted(created.id);
    expect(failed.extractStatus).toBe('FAILED');
    expect(failed.extractError).toBeTruthy();
    expect(failed.status).toBe('PENDING_REVIEW');

    mockExtract({ contract_no: `E2E4-${runTag}` });
    await request(server).post(`/api/v1/contract/records/${failed.id}/reextract`).set(authed(adminToken)).expect(201);
    const ok = await waitExtracted(failed.id);
    expect(ok.extractStatus).toBe('DONE');
    expect(ok.paperNo).toBe(`E2E4-${runTag}`);
    await request(server).delete(`/api/v1/contract/records/${failed.id}`).set(authed(adminToken)).expect(200);
  });
});
