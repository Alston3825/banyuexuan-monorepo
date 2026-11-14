import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

/** 喂养记录单旁边的“拍照识别”：上传时带 scope=BABY_FEEDING，只识别宝宝单页；识别范围随资料保存（重新识别时沿用）。 */
describe('P8 喂养记录拍照识别（宝宝单页）(e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let prisma: PrismaService;
  let token: string;
  const authed = () => ({ Authorization: `Bearer ${token}` });
  const tag = Date.now().toString().slice(-7);
  let customerId: string;
  let motherId: string;
  let babyId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    token = ((await request(server).post('/api/v1/auth/login').send({ username: 'admin', password: 'Passw0rd!23' }).expect(201)).body as Json).accessToken;
    customerId = ((await request(server).post('/api/v1/crm/customers').set(authed()).send({ name: `喂养拍照${tag}`, phone: `136${tag}1`.slice(0, 11), source: 'ONLINE_AD' }).expect(201)).body as Json).id;
    const m = (await request(server).post('/api/v1/care/mother-profiles').set(authed()).send({ customerId, deliveryMethod: 'CESAREAN', babies: [{ name: '宝宝', gender: 'MALE' }] }).expect(201)).body as Json;
    motherId = m.id;
    babyId = ((await request(server).get(`/api/v1/care/mother-profiles/${motherId}`).set(authed()).expect(200)).body as Json).babies[0].id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('scope=BABY_FEEDING 随资料保存；不传则是整张纸；乱传被拒', async () => {
    const up = (scope?: string) => {
      const r = request(server).post('/api/v1/care/documents').set(authed()).field('docType', 'DAILY_RECORD').field('motherProfileId', motherId).field('babyProfileId', babyId).field('autoExtract', 'false');
      if (scope) r.field('scope', scope);
      return r.attach('files', PNG, 'a.png');
    };
    const a = (await up('BABY_FEEDING').expect(201)).body as Json;
    expect((await prisma.careDocument.findUniqueOrThrow({ where: { id: a.id } })).extractScope).toBe('BABY_FEEDING');
    const b = (await up().expect(201)).body as Json;
    expect((await prisma.careDocument.findUniqueOrThrow({ where: { id: b.id } })).extractScope).toBeNull();
    await up('WHATEVER').expect(400);
  });
});
