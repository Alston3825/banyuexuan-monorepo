import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 薪资可见范围：部门负责人只能看本部门（含下级部门）和自己的薪资单，店长/管理员看全部。 */
describe('P8 薪资单按部门收紧 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let prisma: PrismaService;
  let adminToken: string;
  let managerToken: string;
  let headToken: string;
  const tag = Date.now().toString().slice(-6);
  const authed = (t: string) => ({ Authorization: `Bearer ${t}` });
  const ids: { accounts: string[]; depts: string[]; payrolls: string[] } = { accounts: [], depts: [], payrolls: [] };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    const login = async (u: string, p = 'Passw0rd!23') => ((await request(server).post('/api/v1/auth/login').send({ username: u, password: p }).expect(201)).body as Json).accessToken as string;
    adminToken = await login('admin');
    managerToken = await login('store_manager');

    const store = await prisma.store.findFirstOrThrow({ where: {} });
    const mk = async (code: string, parentId?: string) => {
      const d = await prisma.department.create({ data: { tenantId: store.tenantId, storeId: store.id, code: `${code}${tag}`, name: `${code}${tag}`, parentId: parentId ?? null, createdBy: 'E2E' } });
      ids.depts.push(d.id);
      return d;
    };
    const deptA = await mk('SA');
    const deptA1 = await mk('SA1', deptA.id);
    const deptB = await mk('SB');
    const mkAcc = async (name: string, departmentId: string) => {
      const a = (await request(server).post('/api/v1/platform/accounts').set(authed(adminToken)).send({ username: `ps_${name}${tag}`, realName: `薪${name}${tag}`, password: 'Passw0rd!23', storeId: store.id, departmentId, employeeNo: `PS${name}${tag}`, hireDate: '2025-01-01' }).expect(201)).body as Json;
      ids.accounts.push(a.id);
      return a;
    };
    const head = await mkAcc('H', deptA.id);
    const inA1 = await mkAcc('A1', deptA1.id);
    const inB = await mkAcc('B', deptB.id);
    const roles = Object.fromEntries(((await request(server).get('/api/v1/platform/roles').set(authed(adminToken)).expect(200)).body as Json[]).map((r) => [r.code, r.id]));
    await request(server).post(`/api/v1/platform/accounts/${head.id}/role-assignments`).set(authed(adminToken)).send({ roleId: roles.DEPT_HEAD, scopeType: 'STORE', scopeIds: [store.id] }).expect(201);
    headToken = await login(`ps_H${tag}`);
    for (const a of [head, inA1, inB]) {
      const p = await prisma.employeeProfile.findUniqueOrThrow({ where: { accountId: a.id } });
      const r = await prisma.payrollRecord.create({ data: { tenantId: store.tenantId, storeId: store.id, employeeProfileId: p.id, period: '2031-01', baseSalary: 1000, netAmount: 1000, createdBy: 'E2E' } });
      ids.payrolls.push(r.id);
    }
  });

  afterAll(async () => {
    await prisma.payrollRecord.deleteMany({ where: { id: { in: ids.payrolls } } });
    await prisma.employeeProfile.deleteMany({ where: { accountId: { in: ids.accounts } } });
    await prisma.accountRoleAssignment.deleteMany({ where: { accountId: { in: ids.accounts } } });
    await prisma.refreshToken.deleteMany({ where: { accountId: { in: ids.accounts } } });
    await prisma.account.deleteMany({ where: { id: { in: ids.accounts } } });
    await prisma.department.deleteMany({ where: { id: { in: [...ids.depts].reverse() } } });
    await app.close();
  });

  it('部门负责人只看到本部门+下级部门+自己的薪资单；其他部门的查不到；店长/管理员看全部', async () => {
    const list = async (t: string) => ((await request(server).get('/api/v1/hr/payroll-records').query({ period: '2031-01' }).set(authed(t)).expect(200)).body as Json[]).map((r) => r.id as string);
    const headSees = await list(headToken);
    expect(headSees).toEqual(expect.arrayContaining([ids.payrolls[0], ids.payrolls[1]]));
    expect(headSees).not.toContain(ids.payrolls[2]);
    await request(server).get(`/api/v1/hr/payroll-records/${ids.payrolls[1]}`).set(authed(headToken)).expect(200);
    await request(server).get(`/api/v1/hr/payroll-records/${ids.payrolls[2]}`).set(authed(headToken)).expect(404);
    for (const t of [adminToken, managerToken]) {
      const all = await list(t);
      expect(all).toEqual(expect.arrayContaining(ids.payrolls));
    }
  });
});
