import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 物品：编码自动生成；已有物品可以改计量单位 */
describe('P8 物品自动编码与改单位 (e2e)', () => {
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
    token = ((await request(server).post('/api/v1/auth/login').send({ username: 'admin', password: 'Passw0rd!23' }).expect(201)).body as Json).accessToken as string;
  });
  afterAll(async () => {
    await app.close();
  });

  it('不填编码 → 自动编 WP 号并依次递增；填了编码照用；新建默认用途不填也能建', async () => {
    const a = (await request(server).post('/api/v1/inventory/items').set(authed()).send({ name: `自动编码甲${tag}`, unit: '瓶' }).expect(201)).body as Json;
    const b = (await request(server).post('/api/v1/inventory/items').set(authed()).send({ name: `自动编码乙${tag}`, unit: '箱', purpose: 'LOGISTICS' }).expect(201)).body as Json;
    expect(a.code).toMatch(/^WP\d{4,}$/);
    expect(b.code).toMatch(/^WP\d{4,}$/);
    expect(Number(b.code.slice(2))).toBe(Number(a.code.slice(2)) + 1);
    const manual = (await request(server).post('/api/v1/inventory/items').set(authed()).send({ code: `man_${tag}`, name: `手填编码${tag}`, unit: '个' }).expect(201)).body as Json;
    expect(manual.code).toBe(`man_${tag}`);
    // 手填的不影响自动编号
    const c = (await request(server).post('/api/v1/inventory/items').set(authed()).send({ name: `自动编码丙${tag}`, unit: '个' }).expect(201)).body as Json;
    expect(Number(c.code.slice(2))).toBe(Number(b.code.slice(2)) + 1);
  });

  it('已有物品可以改计量单位（不能改成空）', async () => {
    const a = (await request(server).post('/api/v1/inventory/items').set(authed()).send({ name: `改单位${tag}`, unit: '箱' }).expect(201)).body as Json;
    const u = (await request(server).patch(`/api/v1/inventory/items/${a.id}`).set(authed()).send({ unit: ' 件 ', version: a.version }).expect(200)).body as Json;
    expect(u.unit).toBe('件');
    await request(server).patch(`/api/v1/inventory/items/${a.id}`).set(authed()).send({ unit: '  ', version: u.version }).expect(400);
  });
});
