import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { AiGatewayClient } from '../src/ai/ai-gateway/ai-gateway.client';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 新生儿入所评估拍照识别：宝宝是男宝时，AI 误填的“女：”栏目要去掉（反之亦然）。 */
describe('P8 识别结果按宝宝性别过滤 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let token: string;
  const tag = Date.now().toString().slice(-7);
  const authed = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    token = ((await request(server).post('/api/v1/auth/login').send({ username: 'admin', password: 'Passw0rd!23' }).expect(201)).body as Json).accessToken;
    jest.spyOn(app.get(AiGatewayClient), 'extractCareForm').mockImplementation(async () => ({
      data: { testis: 'DESCENDED', hydrocele: 'NO', vaginalDischarge: 'YES', labiaDevelopment: 'NORMAL', urethraFemale: 'NORMAL' },
      warnings: [{ field: 'vaginalDischarge', level: 'warn', message: 'x' }, { field: 'testis', level: 'warn', message: 'y' }],
      model: 'mock',
      latency_ms: 1,
      page_count: 1,
    }));
  });
  afterAll(async () => {
    await app.close();
  });

  const run = async (gender: 'MALE' | 'FEMALE') => {
    const c = (await request(server).post('/api/v1/crm/customers').set(authed()).send({ name: `性别过滤${gender}${tag}`, phone: `135${tag}${gender === 'MALE' ? 1 : 2}`.slice(0, 11), source: 'ONLINE_AD' }).expect(201)).body as Json;
    const m = (await request(server).post('/api/v1/care/mother-profiles').set(authed()).send({ customerId: c.id, deliveryMethod: 'CESAREAN', babies: [{ name: '宝', gender }] }).expect(201)).body as Json;
    const babyId = ((await request(server).get(`/api/v1/care/mother-profiles/${m.id}`).set(authed()).expect(200)).body as Json).babies[0].id;
    const doc = (
      await request(server)
        .post('/api/v1/care/documents')
        .set(authed())
        .field('docType', 'BABY_ADMISSION')
        .field('motherProfileId', m.id)
        .field('babyProfileId', babyId)
        .attach('files', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]), { filename: 'a.jpg', contentType: 'image/jpeg' })
        .expect(201)
    ).body as Json;
    for (let i = 0; i < 40; i++) {
      const d = (await request(server).get(`/api/v1/care/documents/${doc.id}`).set(authed())).body as Json;
      if (d.extractStatus === 'DONE' || d.extractStatus === 'FAILED') return d;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error('识别没有完成');
  };

  it('男宝：只留男栏目；女宝：只留女栏目', async () => {
    const male = await run('MALE');
    expect(male.extractStatus).toBe('DONE');
    expect(Object.keys(male.extractData).sort()).toEqual(['hydrocele', 'testis']);
    expect(male.extractWarnings.map((w: Json) => w.field)).toEqual(['testis']);
    const female = await run('FEMALE');
    expect(Object.keys(female.extractData).sort()).toEqual(['labiaDevelopment', 'urethraFemale', 'vaginalDischarge']);
  });
});
