import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 门店下拉：各业务页选“所属门店”都要用，登录即可取，不要求“门店管理”权限（范围仍按账号数据范围收窄）。 */
describe('P8 门店下拉不依赖门店管理权限 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
  });
  afterAll(async () => {
    await app.close();
  });

  it('没有 platform.store.view 的普通员工也能取到门店下拉；未登录仍是 401', async () => {
    const login = await request(server).post('/api/v1/auth/login').send({ username: 'store_staff', password: 'Passw0rd!23' }).expect(201);
    expect(login.body.permissions).not.toContain('platform.store.view');
    const list = (await request(server).get('/api/v1/platform/stores').set({ Authorization: `Bearer ${login.body.accessToken}` }).expect(200)).body as Json[];
    expect(list.length).toBeGreaterThan(0);
    await request(server).get('/api/v1/platform/stores').expect(401);
  });
});
