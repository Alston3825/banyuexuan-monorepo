import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 新生儿入所评估 → 宝宝档案（出生日期/出生体重自动填）+ 生长曲线（出生点、按入所日期画入所体重/身长/头围） */
describe('P8 入所评估与生长曲线 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let prisma: PrismaService;
  let token: string;
  const tag = Date.now().toString().slice(-7);
  const authed = () => ({ Authorization: `Bearer ${token}` });

  const newBaby = async (n: number, patch: Json = {}) => {
    const c = (await request(server).post('/api/v1/crm/customers').set(authed()).send({ name: `入所曲线${tag}${n}`, phone: `135${tag}${n}`.slice(0, 11), source: 'ONLINE_AD' }).expect(201)).body as Json;
    const m = (await request(server).post('/api/v1/care/mother-profiles').set(authed()).send({ customerId: c.id, deliveryMethod: 'VAGINAL', babies: [{ name: '宝', gender: 'MALE', ...patch }] }).expect(201)).body as Json;
    return ((await request(server).get(`/api/v1/care/mother-profiles/${m.id}`).set(authed()).expect(200)).body as Json).babies[0].id as string;
  };
  const admit = (babyId: string, values: Json) => request(server).post('/api/v1/care/assessments/BABY_ADMISSION').set(authed()).send({ profileId: babyId, values });
  const report = async (babyId: string) => (await request(server).get(`/api/v1/care/growth/baby/${babyId}`).set(authed()).expect(200)).body as Json;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    token = ((await request(server).post('/api/v1/auth/login').send({ username: 'admin', password: 'Passw0rd!23' }).expect(201)).body as Json).accessToken;
  });
  afterAll(async () => {
    await app.close();
  });

  it('1. 入所评估填了出生日期/出生体重 → 宝宝档案里空着的自动填上；曲线有“出生”点，入所体重/身长/头围按入所日期画点', async () => {
    const baby = await newBaby(1);
    await admit(baby, { birthDate: '2026-10-01', birthWeightG: 3400, admissionDate: '2026-10-05', admissionWeightG: 3300, admissionLengthCm: 50.5, headCircumferenceCm: 34 }).expect(201);
    const p = await prisma.babyProfile.findUniqueOrThrow({ where: { id: baby } });
    expect(p.birthDate?.toISOString().slice(0, 10)).toBe('2026-10-01');
    expect(p.birthWeightGrams).toBe(3400);
    const r = await report(baby);
    expect(r.ready).toBe(true);
    expect(r.hints).toEqual([]);
    const w = r.points.weight.map((x: Json) => [x.date, x.value, x.source]);
    expect(w).toEqual([['2026-10-01', 3400, 'BIRTH'], ['2026-10-05', 3300, 'ADMISSION']]);
    expect(r.points.length[0]).toMatchObject({ date: '2026-10-05', value: 50.5, source: 'ADMISSION' });
    expect(r.points.head[0]).toMatchObject({ date: '2026-10-05', value: 34, source: 'ADMISSION' });
  });

  it('2. 宝宝档案里已经有的出生信息不会被入所评估覆盖（人工改过的算数）', async () => {
    const baby = await newBaby(2, { birthDate: '2026-09-28T00:00:00.000Z', birthWeightGrams: 3000 });
    await admit(baby, { birthDate: '2026-10-01', birthWeightG: 3400 }).expect(201);
    const p = await prisma.babyProfile.findUniqueOrThrow({ where: { id: baby } });
    expect(p.birthDate?.toISOString().slice(0, 10)).toBe('2026-09-28');
    expect(p.birthWeightGrams).toBe(3000);
  });

  it('3. 填了入所体重却没填入所日期：提醒补入所日期，不乱画点', async () => {
    const baby = await newBaby(3);
    await admit(baby, { birthDate: '2026-10-01', admissionWeightG: 3300 }).expect(201);
    const r = await report(baby);
    expect(r.hints.join('')).toContain('入所日期');
    expect(r.points.weight).toEqual([]);
  });

  it('4. 生长数据表：按日期合并出生/入所评估/日常护理/手工修改；改一行 = 曲线跟着变；清空 = 恢复系统数据；只有护理长/店长/超管能改', async () => {
    const baby = await newBaby(4);
    await admit(baby, { birthDate: '2026-10-01', birthWeightG: 3400, admissionDate: '2026-10-05', admissionWeightG: 3300, admissionLengthCm: 50.5, headCircumferenceCm: 34 }).expect(201);
    const t0 = (await report(baby)).table as Json[];
    expect(t0.map((r) => [r.date, r.weightG, r.lengthCm, r.headCm, r.sources.weight])).toEqual([
      ['2026-10-01', 3400, null, null, 'BIRTH'],
      ['2026-10-05', 3300, 50.5, 34, 'ADMISSION'],
    ]);
    expect(t0[1].ageDays).toBe(4);
    expect(t0[1].recordId).toBeNull();

    // 超管改入所体重（手工修改覆盖，曲线跟着变）；同一天只留一条手工记录
    const save = (body: Json, t = token) => request(server).post('/api/v1/care/growth/records').set({ Authorization: `Bearer ${t}` }).send({ babyProfileId: baby, ...body });
    await save({ measuredAt: '2026-10-05', weightG: 3350 }).expect(201);
    await save({ measuredAt: '2026-10-05', headCm: 34.5 }).expect(201); // 只改头围，体重的手工修改保留
    const t1 = (await report(baby)).table as Json[];
    expect(t1[1]).toMatchObject({ weightG: 3350, lengthCm: 50.5, headCm: 34.5 });
    expect(t1[1].sources).toEqual({ weight: 'GROWTH', length: 'ADMISSION', head: 'GROWTH' });
    expect(await prisma.babyGrowthRecord.count({ where: { babyProfileId: baby } })).toBe(1);
    const r1 = await report(baby);
    expect(r1.points.weight.find((p: Json) => p.date === '2026-10-05')).toMatchObject({ value: 3350, source: 'GROWTH' });

    // 把手工修改都清掉 → 恢复成入所评估里的原值，手工记录删除
    await save({ measuredAt: '2026-10-05', weightG: null, headCm: null }).expect(201);
    const t2 = (await report(baby)).table as Json[];
    expect(t2[1]).toMatchObject({ weightG: 3300, headCm: 34, recordId: null });
    expect(await prisma.babyGrowthRecord.count({ where: { babyProfileId: baby } })).toBe(0);

    // 权限：普通员工不能改；店长可以
    const login = async (u: string) => ((await request(server).post('/api/v1/auth/login').send({ username: u, password: 'Passw0rd!23' }).expect(201)).body as Json).accessToken as string;
    await save({ measuredAt: '2026-10-06', weightG: 3400 }, await login('store_staff')).expect(403);
    await save({ measuredAt: '2026-10-06', weightG: 3400 }, await login('store_manager')).expect(201);
  });
});
