import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 角色权限批量保存：一次请求调整几百个权限点（逐个请求会触发全局限流，表现成“权限保存失败”）。 */
describe('P8 角色权限批量保存 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let adminToken: string;
  const tag = Date.now().toString().slice(-6);
  const authed = () => ({ Authorization: `Bearer ${adminToken}` });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    adminToken = ((await request(server).post('/api/v1/auth/login').send({ username: 'admin', password: 'Passw0rd!23' }).expect(201)).body as Json).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('一次请求授予 300+ 个权限点、再一次请求撤销一部分；未知权限点被拒；系统内置角色不可改', async () => {
    const role = (await request(server).post('/api/v1/platform/roles').set(authed()).send({ code: `BULK${tag}`, name: `批量权限测试${tag}` }).expect(201)).body as Json;
    const perms = (await request(server).get('/api/v1/platform/permissions').set(authed()).expect(200)).body as Json[];
    expect(perms.length).toBeGreaterThan(300);
    const ids = perms.map((p) => p.id as string);

    const first = (await request(server).put(`/api/v1/platform/roles/${role.id}/permissions`).set(authed()).send({ grant: ids, revoke: [] }).expect(200)).body as Json;
    expect(first).toEqual({ granted: ids.length, revoked: 0 });
    const count = async () => (((await request(server).get(`/api/v1/platform/roles/${role.id}`).set(authed()).expect(200)).body as Json).permissions as Json[]).length;
    expect(await count()).toBe(ids.length);

    // 重复授予不报错、不重复；同时撤销前 50 个
    const second = (await request(server).put(`/api/v1/platform/roles/${role.id}/permissions`).set(authed()).send({ grant: ids.slice(0, 100), revoke: ids.slice(0, 50) }).expect(200)).body as Json;
    expect(second.revoked).toBe(50);
    expect(await count()).toBe(ids.length - 50);

    await request(server).put(`/api/v1/platform/roles/${role.id}/permissions`).set(authed()).send({ grant: ['not-exist'], revoke: [] }).expect(400);
    const superAdmin = ((await request(server).get('/api/v1/platform/roles').set(authed()).expect(200)).body as Json[]).find((r) => r.code === 'SUPER_ADMIN')!;
    await request(server).put(`/api/v1/platform/roles/${superAdmin.id}/permissions`).set(authed()).send({ grant: [], revoke: [ids[0]] }).expect(403);

    await request(server).delete(`/api/v1/platform/roles/${role.id}`).set(authed());
  });
});
