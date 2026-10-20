import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 宝宝生长曲线：和 WS/T 423-2022 国家标准百分位对比；日常护理里的体重自动并入；发给客户的链接。 */
describe('P8 宝宝生长曲线 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let prisma: PrismaService;
  let token: string;
  let babyId: string;
  let motherId: string;
  const tag = Date.now().toString().slice(-7);
  const authed = () => ({ Authorization: `Bearer ${token}` });
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const day = (offset: number) => ymd(new Date(Date.now() + 8 * 3600_000 + offset * 86_400_000));
  const get = async () => (await request(server).get(`/api/v1/care/growth/baby/${babyId}`).set(authed()).expect(200)).body as Json;
  const add = (body: Json) => request(server).post('/api/v1/care/growth/records').set(authed()).send({ babyProfileId: babyId, ...body });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    token = ((await request(server).post('/api/v1/auth/login').send({ username: 'admin', password: 'Passw0rd!23' }).expect(201)).body as Json).accessToken;
    const c = (await request(server).post('/api/v1/crm/customers').set(authed()).send({ name: `生长曲线${tag}`, phone: `134${tag}1`.slice(0, 11), source: 'ONLINE_AD' }).expect(201)).body as Json;
    const m = (await request(server).post('/api/v1/care/mother-profiles').set(authed()).send({ customerId: c.id, deliveryMethod: 'CESAREAN', babies: [{ name: '小宝', gender: 'UNKNOWN' }] }).expect(201)).body as Json;
    motherId = m.id;
    babyId = ((await request(server).get(`/api/v1/care/mother-profiles/${motherId}`).set(authed()).expect(200)).body as Json).babies[0].id;
  });
  afterAll(async () => {
    await app.close();
  });

  it('1. 没填性别/出生日期时提示先补；补上后用标准算百分位：出生当天 3.5kg/51.2cm/34.3cm 的男宝宝正好是 P50（中）', async () => {
    const r0 = await get();
    expect(r0.ready).toBe(false);
    expect(r0.notReady).toEqual(expect.arrayContaining(['宝宝性别', '出生日期']));
    await prisma.babyProfile.update({ where: { id: babyId }, data: { gender: 'MALE', birthDate: new Date(`${day(-20)}T00:00:00.000Z`) } });
    await add({ measuredAt: day(-20), weightKg: 3.5, lengthCm: 51.2, headCm: 34.3 }).expect(201);
    const r = await get();
    expect(r.ready).toBe(true);
    expect(r.latest).toHaveLength(3);
    for (const l of r.latest) expect(l).toMatchObject({ rating: '中', pctText: '约第 50 百分位' });
    expect(r.curves.weight.ages.slice(0, 4)).toEqual([0, 1, 2, 3]);
    expect(r.curves.weight.rows[0]).toEqual([2.8, 3.0, 3.2, 3.5, 3.7, 4.0, 4.2]); // 标准表 A.1 男童 0 月
    expect(r.curves.head.rows[1]).toEqual([34.8, 35.5, 36.2, 37.0, 37.8, 38.5, 39.2]); // 表 A.11 男童 1 月
    expect(r.source).toContain('WS/T 423');
  });

  it('2. 之后复测：体重偏低标“下”、偏高标“上”；月龄之间线性插值；日常护理记录里的体重自动并入曲线', async () => {
    await add({ measuredAt: day(-10), weightKg: 2.5, lengthCm: 50.0 }).expect(201); // 10 天，体重低于 P3
    let r = await get();
    const w = r.points.weight.find((p: Json) => p.date === day(-10));
    expect(w).toMatchObject({ rating: '下', pctText: '低于第 3 百分位', source: 'GROWTH' });
    expect(w.ageMonths).toBeCloseTo(10 / 30.4375, 1);
    await add({ measuredAt: day(-5), weightKg: 6.5 }).expect(201); // 偏高
    r = await get();
    expect(r.points.weight.find((p: Json) => p.date === day(-5))).toMatchObject({ rating: '上' });

    // 日常护理记录里记的体重：自动出现在体重曲线上，不用重复录
    const dailyDate = day(-2);
    const rec = await prisma.careDailyRecord.create({ data: { tenantId: (await prisma.motherProfile.findUniqueOrThrow({ where: { id: motherId } })).tenantId, storeId: (await prisma.motherProfile.findUniqueOrThrow({ where: { id: motherId } })).storeId, motherProfileId: motherId, recordDate: new Date(`${dailyDate}T00:00:00.000Z`), createdBy: 'E2E' } });
    await prisma.careDailyBabyRecord.create({ data: { tenantId: rec.tenantId, storeId: rec.storeId, dailyRecordId: rec.id, babyProfileId: babyId, weightKg: 3.9, createdBy: 'E2E' } });
    r = await get();
    expect(r.points.weight.find((p: Json) => p.date === dailyDate)).toMatchObject({ value: 3.9, source: 'DAILY' });
    // 同一天手工测量优先于日常记录
    await add({ measuredAt: dailyDate, weightKg: 4.0 }).expect(201);
    r = await get();
    expect(r.points.weight.find((p: Json) => p.date === dailyDate)).toMatchObject({ value: 4.0, source: 'GROWTH' });
  });

  it('3. 数值校验：至少填一项、范围合理、不能是未来、不能早于出生日；可删除', async () => {
    await add({ measuredAt: day(-1) }).expect(400);
    await add({ measuredAt: day(-1), weightKg: 99 }).expect(400);
    await add({ measuredAt: day(-1), lengthCm: 5 }).expect(400);
    await add({ measuredAt: day(3), weightKg: 4 }).expect(400);
    await add({ measuredAt: day(-30), weightKg: 3.5 }).expect(400); // 早于出生
    const r = await get();
    const one = r.records.find((x: Json) => x.date === day(-5));
    await request(server).delete(`/api/v1/care/growth/records/${one.id}`).set(authed()).expect(204);
    expect((await get()).records.some((x: Json) => x.id === one.id)).toBe(false);
  });

  it('4. 发给客户的链接：不用登录能打开、随记录更新；重新生成后旧链接失效；作废后打不开；乱写的链接 404', async () => {
    await request(server).get(`/api/v1/care/growth/baby/${babyId}`).expect(401);
    const a = (await request(server).post(`/api/v1/care/growth/baby/${babyId}/share`).set(authed()).expect(201)).body as Json;
    expect(a.path).toBe(`/g/${a.token}`);
    const pub = (await request(server).get(`/api/v1/public/growth/${a.token}`).expect(200)).body as Json;
    expect(pub.baby.sex).toBe('MALE');
    expect(pub.points.weight.length).toBeGreaterThan(0);
    expect(pub.baby).not.toHaveProperty('customerId');
    const b = (await request(server).post(`/api/v1/care/growth/baby/${babyId}/share`).set(authed()).expect(201)).body as Json;
    await request(server).get(`/api/v1/public/growth/${a.token}`).expect(410); // 旧链接作废
    await request(server).get(`/api/v1/public/growth/${b.token}`).expect(200);
    await request(server).post(`/api/v1/care/growth/baby/${babyId}/share/revoke`).set(authed()).expect(201);
    await request(server).get(`/api/v1/public/growth/${b.token}`).expect(410);
    await request(server).get('/api/v1/public/growth/not-a-token').expect(404);
  });
  it('5. 两套标准可切换：WHO 按日表（出生当天男宝体重 P50=3.346）、曲线只到 3 个月；默认是国家标准；客户链接同样支持 standard 参数', async () => {
    const cn = await get();
    expect(cn.standard).toBe('CN');
    expect(cn.maxMonths).toBe(3);
    expect(cn.curves.weight.ages).toEqual([0, 1, 2, 3]);
    const who = (await request(server).get(`/api/v1/care/growth/baby/${babyId}?standard=WHO`).set(authed()).expect(200)).body as Json;
    expect(who.standard).toBe('WHO');
    expect(who.standardLabel).toContain('WHO');
    expect(who.curves.weight.ages[0]).toBe(0);
    expect(who.curves.weight.ages.at(-1)).toBe(3);
    expect(who.curves.weight.rows[0]).toEqual([2.507, 2.758, 3.027, 3.346, 3.687, 4.011, 4.35]); // WHO 男宝体重第 0 天
    expect(who.points.weight.some((p: Json) => p.row)).toBe(true);
    // 出生当天 3.5kg：WHO 的 P50 是 3.346，所以评价按 WHO 的行算
    const w0 = who.points.weight.find((p: Json) => p.ageDays === 0);
    expect(w0.row[3]).toBe(3.346);
    const link = (await request(server).post(`/api/v1/care/growth/baby/${babyId}/share`).set(authed()).expect(201)).body as Json;
    const pw = (await request(server).get(`/api/v1/public/growth/${link.token}?standard=who`).expect(200)).body as Json;
    expect(pw.standard).toBe('WHO');
  });
});
