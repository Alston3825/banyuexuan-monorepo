import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 给员工分配角色：范围可多选、不重复、对象必填且必须存在、不能越权分配更大的角色/管不到的范围、撤销校验归属。 */
describe('P8 角色分配规则 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let prisma: PrismaService;
  let adminToken: string;
  let managerToken: string;
  let stores: Json[];
  let roles: Record<string, string>;
  let accountId: string;
  const PHONE = '19900044001';
  const authed = (t: string) => ({ Authorization: `Bearer ${t}` });
  const assign = (t: string, body: Json, id = accountId) => request(server).post(`/api/v1/platform/accounts/${id}/role-assignments`).set(authed(t)).send(body);
  const detail = async () => (await request(server).get(`/api/v1/platform/accounts/${accountId}`).set(authed(adminToken)).expect(200)).body as Json;

  async function cleanup() {
    const acc = await prisma.account.findMany({ where: { phone: PHONE }, select: { id: true } });
    const ids = acc.map((a) => a.id);
    await prisma.accountRoleAssignment.deleteMany({ where: { accountId: { in: ids } } });
    await prisma.refreshToken.deleteMany({ where: { accountId: { in: ids } } });
    await prisma.account.deleteMany({ where: { id: { in: ids } } });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    await cleanup();
    const login = async (u: string) => ((await request(server).post('/api/v1/auth/login').send({ username: u, password: 'Passw0rd!23' }).expect(201)).body as Json).accessToken as string;
    adminToken = await login('admin');
    managerToken = await login('store_manager');
    stores = (await request(server).get('/api/v1/platform/stores').set(authed(adminToken)).expect(200)).body as Json[];
    roles = Object.fromEntries(((await request(server).get('/api/v1/platform/roles').set(authed(adminToken)).expect(200)).body as Json[]).map((r) => [r.code, r.id]));
    const created = (await request(server).post('/api/v1/platform/accounts').set(authed(adminToken)).send({ username: PHONE, realName: '角色分配测试', password: 'banyuexuan', phone: PHONE, storeId: stores[0].id }).expect(201)).body as Json;
    accountId = created.id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('1. 范围对象可以多选：一次选多家门店，每家生成一条分配；同角色同范围再分配被拒；部分重复自动跳过', async () => {
    expect(stores.length).toBeGreaterThanOrEqual(2);
    const s = stores.slice(0, 2).map((x) => x.id as string);
    const first = (await assign(adminToken, { roleId: roles.CUSTOMER_SERVICE, scopeType: 'STORE', scopeIds: s }).expect(201)).body as Json;
    expect(first).toMatchObject({ createdCount: 2, skippedCount: 0 });
    expect((await detail()).roleAssignments).toHaveLength(2);

    const dup = await assign(adminToken, { roleId: roles.CUSTOMER_SERVICE, scopeType: 'STORE', scopeIds: [s[0]] }).expect(409);
    expect(dup.body.message).toContain('不需要重复分配');
    // 兼容旧的单个 scopeId 写法，也一样判重
    await assign(adminToken, { roleId: roles.CUSTOMER_SERVICE, scopeType: 'STORE', scopeId: s[1] }).expect(409);
    expect((await detail()).roleAssignments).toHaveLength(2);

    // 不同角色同范围可以；部分重复：只新增没有的
    if (stores.length >= 3) {
      const mixed = (await assign(adminToken, { roleId: roles.CUSTOMER_SERVICE, scopeType: 'STORE', scopeIds: [s[0], stores[2].id] }).expect(201)).body as Json;
      expect(mixed).toMatchObject({ createdCount: 1, skippedCount: 1 });
    }
    await assign(adminToken, { roleId: roles.PURCHASER, scopeType: 'STORE', scopeIds: [s[0]] }).expect(201);
  });

  it('2. 校验：门店级不选对象被拒；对象或角色不存在被拒（不再是“服务器内部错误”）', async () => {
    const noScope = await assign(adminToken, { roleId: roles.DEPT_HEAD, scopeType: 'STORE' }).expect(400);
    expect(noScope.body.message).toContain('请选择范围对象');
    await assign(adminToken, { roleId: roles.DEPT_HEAD, scopeType: 'STORE', scopeIds: ['not-exist'] }).expect(400);
    const noRole = await assign(adminToken, { roleId: 'not-exist', scopeType: 'TENANT' }).expect(400);
    expect(noRole.body.message).toContain('角色不存在');
    // 租户级/仅本人不需要对象
    await assign(adminToken, { roleId: roles.DEPT_HEAD, scopeType: 'SELF' }).expect(201);
    await assign(adminToken, { roleId: roles.DEPT_HEAD, scopeType: 'SELF' }).expect(409); // 仅本人也判重
  });

  it('3. 防越权：店长不能分配超级管理员（权限比自己大），不能分配全公司范围，也不能分配到管不到的门店', async () => {
    const mgrStoreId = ((await prisma.accountRoleAssignment.findMany({ where: { account: { username: 'store_manager' }, revokedAt: null, scopeType: 'STORE' } }))[0]?.scopeId) as string;
    const other = stores.find((x) => x.id !== mgrStoreId)!;
    const big = await assign(managerToken, { roleId: roles.SUPER_ADMIN, scopeType: 'TENANT' }).expect(403);
    expect(big.body.message).toContain('不能分配权限比自己大的角色');
    await assign(managerToken, { roleId: roles.STORE_STAFF, scopeType: 'TENANT' }).expect(403);
    await assign(managerToken, { roleId: roles.STORE_STAFF, scopeType: 'STORE', scopeIds: [other.id] }).expect(403);
    // 自己管的门店可以分配比自己小的角色
    await assign(managerToken, { roleId: roles.STORE_STAFF, scopeType: 'STORE', scopeIds: [mgrStoreId] }).expect(201);
  });

  it('4. 撤销：必须是这位员工名下的分配；撤销后可以重新分配', async () => {
    const a = await detail();
    const target = a.roleAssignments[0];
    await request(server).delete(`/api/v1/platform/accounts/${adminToken ? 'wrong-account-id' : ''}/role-assignments/${target.id}`).set(authed(adminToken)).expect(404);
    await request(server).delete(`/api/v1/platform/accounts/${accountId}/role-assignments/${target.id}`).set(authed(adminToken)).expect(200);
    expect((await detail()).roleAssignments.some((x: Json) => x.id === target.id)).toBe(false);
    await assign(adminToken, { roleId: target.roleId, scopeType: target.scopeType, scopeIds: target.scopeId ? [target.scopeId] : [] }).expect(201);
  });
});
