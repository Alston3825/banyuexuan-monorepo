import { deflateSync, crc32 } from 'zlib';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 生成一张带“笔迹”（随机噪点）的真 PNG，体积够大，能通过“不是空白画布”的校验 */
function makePng(w = 120, h = 40, blank = false): string {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w * 4; x++) raw[y * (w * 4 + 1) + 1 + x] = blank ? 0 : Math.floor(Math.random() * 256);
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 护理档案签字：员工电子签名图 → 日常记录护理师签字（白/夜/替班，一对多、替班）→ 内容改动后提示重签 →
 * 发给客户的确认链接（手机号后四位核验、防连点、手写签名/长按确认、对当班护理师评价、护理师设备识别、7 天窗口）。
 */
describe('P8 护理档案：电子签名 + 客户每日确认 (e2e)', () => {
  jest.setTimeout(60_000); // 防连点测试要真实等待最短阅读时间
  let app: INestApplication<App>;
  let server: App;
  let prisma: PrismaService;
  let adminToken: string;
  let managerToken: string;
  let staffToken: string;
  let motherId: string;
  let babyId: string;
  let phone: string;

  const SEED_PASSWORD = 'Passw0rd!23';
  const runTag = Date.now().toString().slice(-8);
  const authed = (t: string) => ({ Authorization: `Bearer ${t}` });
  const ymd = (offset: number) => new Date(Date.now() + 8 * 3600_000 - offset * 86_400_000).toISOString().slice(0, 10);
  const today = ymd(0);
  const yesterday = ymd(1);
  const old = ymd(10);
  const staffDevice = `STAFFDEV${runTag}abcdefgh`;
  const customerDevice = `CUSTDEV${runTag}abcdefghij`;

  const login = async (username: string, deviceId?: string) => {
    const r = request(server).post('/api/v1/auth/login').send({ username, password: SEED_PASSWORD });
    if (deviceId) r.set('X-Device-Id', deviceId);
    return (await r.expect(201)).body.accessToken as string;
  };
  const saveDay = async (date: string, value: number, version?: number) =>
    (
      await request(server)
        .put('/api/v1/care/daily/day')
        .set(authed(adminToken))
        .send({
          motherProfileId: motherId,
          date,
          ...(version !== undefined ? { version } : {}),
          mother: { motherTemperature: value, motherPlan: '会阴擦洗消毒' },
          babies: [{ babyProfileId: babyId, values: { weightG: 3500, dayShiftSummary: '精神好，吃奶好' }, feedings: [{ time: '08:00', formulaMl: 60, urine: 'YES' }] }],
        })
        .expect(200)
    ).body as Json;
  const dayStatus = async (date: string, token = adminToken) => (await request(server).get('/api/v1/care/daily/signatures').query({ motherProfileId: motherId, date }).set(authed(token)).expect(200)).body as Json;
  const sign = (token: string, date: string, shift: string) => request(server).post('/api/v1/care/daily/signatures').set(authed(token)).send({ motherProfileId: motherId, date, shift });
  const pub = (token: string, path: string) => `/api/v1/public/care-confirm/${token}/${path}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    // 重复跑测试时，先把这三个账号上次录入的签名清掉（测试里要验证“没录签名不能签”）
    await prisma.account.updateMany({ where: { username: { in: ['admin', 'store_manager', 'store_staff'] } }, data: { signatureData: null, signatureUpdatedAt: null } });
    adminToken = await login('admin');
    managerToken = await login('store_manager');
    staffToken = await login('store_staff', staffDevice); // 普通员工在 staffDevice 这台设备上登录过

    phone = `139${runTag}0`.slice(0, 11);
    const customer = (await request(server).post('/api/v1/crm/customers').set(authed(adminToken)).send({ name: `E2E签字客户${runTag}`, phone, source: 'OTHER' }).expect(201)).body;
    const mother = (await request(server).post('/api/v1/care/mother-profiles').set(authed(adminToken)).send({ customerId: customer.id, babies: [{ name: '签字宝', gender: 'FEMALE', birthDate: '2026-10-01T00:00:00.000Z' }] }).expect(201)).body;
    motherId = mother.id;
    babyId = (await request(server).get(`/api/v1/care/mother-profiles/${motherId}`).set(authed(adminToken)).expect(200)).body.babies[0].id;
    await saveDay(today, 36.5);
    await saveDay(yesterday, 36.6);
    await saveDay(old, 36.7);
    // 当天做过一项服务（会出现在客户看到的服务报告里）
    await request(server).post('/api/v1/care/service-logs').set(authed(adminToken)).send({ motherProfileId: motherId, serviceCode: 'BP', doneTime: '00:05', systolic: 118, diastolic: 76 }).expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. 我的电子签名：空白/假图拒绝；录入后能读到；每个人只能管自己的', async () => {
    const put = (t: string, data: string) => request(server).put('/api/v1/me/signature').set(authed(t)).send({ signatureData: data });
    await put(adminToken, 'not-an-image').expect(400);
    await put(adminToken, makePng(120, 40, true)).expect(400); // 全透明空白，体积太小
    expect((await request(server).get('/api/v1/me/signature').set(authed(adminToken)).expect(200)).body.hasSignature).toBe(false);
    await put(adminToken, makePng()).expect(200);
    const me = (await request(server).get('/api/v1/me/signature').set(authed(adminToken)).expect(200)).body;
    expect(me.hasSignature).toBe(true);
    const other = (await request(server).get('/api/v1/me/signature').set(authed(managerToken)).expect(200)).body;
    expect(other.hasSignature).toBe(false); // 别人看不到/没有
    await request(server).get('/api/v1/me/signature').expect(401);
  });

  it('2. 护理师签字：没录签名不能签；白班/夜班/替班多人各签一条；同一人不能重复签；签字只能是本人', async () => {
    await sign(managerToken, today, 'NIGHT').expect(400); // 店长账号还没录入电子签名
    await request(server).put('/api/v1/me/signature').set(authed(managerToken)).send({ signatureData: makePng() }).expect(200);
    await request(server).put('/api/v1/me/signature').set(authed(staffToken)).send({ signatureData: makePng() }).expect(200);
    await sign(adminToken, today, 'WRONG').expect(400);
    await sign(adminToken, today, 'DAY').expect(201);
    await sign(adminToken, today, 'DAY').expect(409); // 已经签过
    await sign(managerToken, today, 'NIGHT').expect(201);
    await sign(staffToken, today, 'RELIEF').expect(201); // 替班的第三位护理师
    await sign(adminToken, ymd(-3), 'DAY').expect(400); // 未来日期；也没有当天记录
    const st = await dayStatus(today);
    expect(st.signatures.map((s: Json) => s.shift).sort()).toEqual(['DAY', 'NIGHT', 'RELIEF']);
    expect(st.signatures.every((s: Json) => !s.stale && s.signatureData.startsWith('data:image/png'))).toBe(true);
    expect(st.signatures.filter((s: Json) => s.mine)).toHaveLength(1);
    expect((await dayStatus(today, managerToken)).signatures.find((s: Json) => s.mine).nurseName).toBeTruthy();
  });

  it('3. 超过 7 天的记录普通护理师不能补签（护理主任可以）；撤销只能撤自己的', async () => {
    await sign(staffToken, old, 'DAY').expect(403);
    await sign(adminToken, old, 'DAY').expect(201); // admin 有 care.profile.approve
    const st = await dayStatus(today);
    const managerSig = st.signatures.find((s: Json) => s.shift === 'NIGHT');
    await request(server).delete(`/api/v1/care/daily/signatures/${managerSig.id}`).set(authed(staffToken)).expect(403); // 员工不能撤别人的
    await request(server).delete(`/api/v1/care/daily/signatures/${managerSig.id}`).set(authed(managerToken)).expect(200);
    await sign(managerToken, today, 'NIGHT').expect(201);
  });

  it('4. 记录内容在签字后被改动：签字标为“需重新签字”，重新签后恢复；日历标记同步', async () => {
    const rec = (await request(server).get('/api/v1/care/daily/day').query({ motherProfileId: motherId, date: today }).set(authed(adminToken)).expect(200)).body;
    await saveDay(today, 37.2, rec.record.version);
    let st = await dayStatus(today);
    expect(st.signatures.every((s: Json) => s.stale)).toBe(true);
    const overview = (await request(server).get('/api/v1/care/daily/sign-overview').query({ motherProfileId: motherId }).set(authed(adminToken)).expect(200)).body as Json[];
    expect(overview.find((d) => d.date === today)).toMatchObject({ signatureCount: 3, staleSignatures: 3, confirmation: 'NONE' });
    await sign(adminToken, today, 'DAY').expect(201); // 重新签（更新）
    await sign(managerToken, today, 'NIGHT').expect(201);
    await sign(staffToken, today, 'RELIEF').expect(201);
    st = await dayStatus(today);
    expect(st.signatures.every((s: Json) => !s.stale)).toBe(true);
    expect(st.signatures).toHaveLength(3);
  });

  let token1: string;
  let confirmSession: string;
  let view1: string;

  it('5. 确认链接：生成后旧链接作废；打开只看到打码姓名；手机号后四位错 → 401，对 → 拿到本次会话', async () => {
    const first = (await request(server).post('/api/v1/care/daily/confirm-links').set(authed(adminToken)).send({ motherProfileId: motherId }).expect(201)).body;
    expect(first.token).toHaveLength(64);
    expect(first.path).toBe(`/c/${first.token}`);
    const second = (await request(server).post('/api/v1/care/daily/confirm-links').set(authed(adminToken)).send({ motherProfileId: motherId }).expect(201)).body;
    await request(server).get(pub(first.token, 'info')).expect(410); // 旧链接已作废
    token1 = second.token;
    const links = (await request(server).get('/api/v1/care/daily/confirm-links').query({ motherProfileId: motherId }).set(authed(adminToken)).expect(200)).body as Json[];
    expect(links[0].status).toBe('ACTIVE');
    expect(links.some((l) => l.status === 'REVOKED')).toBe(true);
    const info = (await request(server).get(pub(token1, 'info')).expect(200)).body;
    expect(info.customerName).toMatch(/^E\*+$/); // 只露第一个字
    await request(server).get(pub('0'.repeat(64), 'info')).expect(404);
    await request(server).get(pub(token1, 'days')).expect(401); // 没核验不能看内容
    const wrong = await request(server).post(pub(token1, 'verify')).send({ phoneLast4: '0000' === phone.slice(-4) ? '1111' : '0000' }).expect(401);
    expect(wrong.body.message).toContain('还可以再试 4 次');
    confirmSession = (await request(server).post(pub(token1, 'verify')).send({ phoneLast4: phone.slice(-4) }).expect(201)).body.session;
    expect(confirmSession).toBeTruthy();
  });

  it('6. 客户看到的“每日服务报告”：最近 7 天有记录的日子、记录小结、当班护理师、当天完成的服务；7 天前的看不到', async () => {
    const res = (await request(server).get(pub(token1, 'days')).set('X-Confirm-Session', confirmSession).expect(200)).body;
    view1 = res.viewToken;
    expect(res.customerName).toMatch(/^E\*+$/);
    const dates = res.days.map((d: Json) => d.date);
    expect(dates).toEqual(expect.arrayContaining([today, yesterday]));
    expect(dates).not.toContain(old); // 10 天前超出 7 天
    const day = res.days.find((d: Json) => d.date === today);
    expect(day.nurses.map((n: Json) => n.shift).sort()).toEqual(['DAY', 'NIGHT', 'RELIEF']);
    expect(day.nurses.every((n: Json) => n.signatureId)).toBe(true);
    expect(day.services.map((s: Json) => s.name)).toContain('产妇血压');
    const motherItems = day.summary.mother.flatMap((g: Json) => g.items.map((i: Json) => `${i.label}:${i.value}`));
    expect(motherItems).toContain('体温:37.2 ℃');
    expect(motherItems.join()).not.toContain('签字'); // 护理师/客户签字栏不给客户看
    expect(day.summary.babies[0].feeding['奶粉合计']).toBe('60 ml');
    expect(day.status).toBe('NONE');
  });

  it('7. 防止“快速连点代确认”：看够时间才能确认；点击确认必须长按；护理师用过的设备上不接受点击确认', async () => {
    const day = (await request(server).get(pub(token1, 'days')).set('X-Confirm-Session', confirmSession).expect(200)).body;
    const view = day.viewToken;
    const nurses = day.days.find((d: Json) => d.date === today).nurses as Json[];
    const confirm = (body: Json) => request(server).post(pub(token1, 'confirm')).set('X-Confirm-Session', confirmSession).send({ viewToken: view, method: 'BUTTON', holdMs: 2000, deviceId: customerDevice, acknowledged: true, ...body });
    const item = (date: string, extra: Json = {}) => ({ date, satisfaction: 5, ...extra });

    const fast = await confirm({ items: [item(today)] }).expect(400);
    expect(fast.body.message).toContain('至少需要');
    await sleep(8500); // 等够最短阅读时间

    await confirm({ items: [item(today)], acknowledged: false }).expect(400);
    await confirm({ items: [item(today)], holdMs: 300 }).expect(400); // 没长按
    await confirm({ items: [{ date: today, satisfaction: 0 }] }).expect(400);
    await confirm({ items: [item(today, { nurseRatings: [{ signatureId: 'not-mine', score: 5 }] })] }).expect(400);
    await confirm({ items: [item(old)] }).expect(400); // 超过 7 天
    await confirm({ items: [item(today)], deviceId: staffDevice }).expect(403); // 护理师的设备不接受“点击确认”

    // 在护理师设备上改用手写签名：允许，但打“设备风险标记”，方便护理主任复核
    const sigRes = await confirm({ items: [item(yesterday, { comment: '谢谢' })], method: 'SIGNATURE', signatureData: makePng(), holdMs: undefined, deviceId: staffDevice }).expect(201);
    expect(sigRes.body.confirmed).toEqual([yesterday]);

    // 客户自己的手机：对三位当班护理师分别评价 + 当天整体评价，长按确认
    const ok = await confirm({
      items: [item(today, { satisfaction: 4, nurseRatings: nurses.map((n, i) => ({ signatureId: n.signatureId, score: 5 - (i % 2) })) })],
    }).expect(201);
    expect(ok.body.confirmed).toEqual([today]);
    await confirm({ items: [item(today)] }).expect(409); // 已经确认过
  });

  it('8. 护理师这边看到完整证据；确认后记录被改动 → 标“确认后有改动”，客户需要重新确认', async () => {
    let st = await dayStatus(today);
    expect(st.confirmation).toMatchObject({ method: 'BUTTON', satisfaction: 4, stale: false });
    expect(st.confirmation.nurseRatings).toHaveLength(3);
    expect(st.confirmation.dwellMs).toBeGreaterThanOrEqual(7000);
    expect(st.confirmation.holdMs).toBe(2000);
    expect(st.confirmation.riskFlags).toEqual([]);
    const y = await dayStatus(yesterday);
    expect(y.confirmation).toMatchObject({ method: 'SIGNATURE', stale: false, comment: '谢谢' });
    expect(y.confirmation.riskFlags).toContain('STAFF_DEVICE'); // 在护理师用过的设备上确认
    expect(y.confirmation.signatureData.startsWith('data:image/png')).toBe(true);

    const rec = (await request(server).get('/api/v1/care/daily/day').query({ motherProfileId: motherId, date: today }).set(authed(adminToken)).expect(200)).body;
    await saveDay(today, 36.9, rec.record.version);
    st = await dayStatus(today);
    expect(st.confirmation.stale).toBe(true);
    const overview = (await request(server).get('/api/v1/care/daily/sign-overview').query({ motherProfileId: motherId }).set(authed(adminToken)).expect(200)).body as Json[];
    expect(overview.find((d) => d.date === today)).toMatchObject({ confirmation: 'STALE', satisfaction: 4 });
    expect(overview.find((d) => d.date === yesterday)).toMatchObject({ confirmation: 'CONFIRMED' });
    const days = (await request(server).get(pub(token1, 'days')).set('X-Confirm-Session', confirmSession).expect(200)).body;
    expect(days.days.find((d: Json) => d.date === today).status).toBe('STALE');
  });

  it('9. 看过的内容被改动后确认会被拦（要求刷新重看）；确认后撤销护理师签字被拒绝', async () => {
    const before = (await request(server).get(pub(token1, 'days')).set('X-Confirm-Session', confirmSession).expect(200)).body.viewToken;
    const rec = (await request(server).get('/api/v1/care/daily/day').query({ motherProfileId: motherId, date: today }).set(authed(adminToken)).expect(200)).body;
    await saveDay(today, 36.8, rec.record.version); // 客户看过之后，护理师又改了
    await sleep(8500);
    const res = await request(server)
      .post(pub(token1, 'confirm'))
      .set('X-Confirm-Session', confirmSession)
      .send({ viewToken: before, items: [{ date: today, satisfaction: 5 }], method: 'BUTTON', holdMs: 2000, deviceId: customerDevice, acknowledged: true })
      .expect(409);
    expect(res.body.message).toContain('刚刚有更新');
    const sig = (await dayStatus(today)).signatures[0];
    await request(server).delete(`/api/v1/care/daily/signatures/${sig.id}`).set(authed(adminToken)).expect(400); // 客户已确认过这一天
  });

  it('10. 手机号核验输错 5 次锁定 30 分钟（锁定期间输对也不行）', async () => {
    const link = (await request(server).post('/api/v1/care/daily/confirm-links').set(authed(adminToken)).send({ motherProfileId: motherId }).expect(201)).body;
    const wrong = phone.slice(-4) === '0000' ? '1111' : '0000';
    for (let i = 0; i < 4; i++) await request(server).post(pub(link.token, 'verify')).send({ phoneLast4: wrong }).expect(401);
    const fifth = await request(server).post(pub(link.token, 'verify')).send({ phoneLast4: wrong }).expect(401);
    expect(fifth.body.message).toContain('锁定');
    const locked = await request(server).post(pub(link.token, 'verify')).send({ phoneLast4: phone.slice(-4) }).expect(403);
    expect(locked.body.message).toContain('锁定');
    expect((await request(server).get(pub(link.token, 'info')).expect(200)).body.locked).toBe(true);
    // 旧链接（token1）已因生成新链接而作废
    await request(server).get(pub(token1, 'days')).set('X-Confirm-Session', confirmSession).expect(410);
  });

  it('11. 员工登录设备被记录：同一设备号重复登录只记一条；格式不对的设备号被忽略', async () => {
    await login('store_staff', staffDevice);
    await login('store_staff', 'short'); // 太短，忽略
    const staff = (await prisma.account.findFirst({ where: { username: 'store_staff' } }))!;
    const rows = await prisma.staffDevice.findMany({ where: { accountId: staff.id } });
    expect(rows.filter((r) => r.deviceId === staffDevice)).toHaveLength(1);
    expect(rows.some((r) => r.deviceId === 'short')).toBe(false);
  });
});
