import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 健康证到期前一个月：员工本人、本部门负责人、本门店店长的“我的待办”里出现提醒，别的人没有 */
describe('P8 健康证到期待办提醒 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let prisma: PrismaService;
  let adminToken: string;
  const tag = Date.now().toString().slice(-7);
  const PW = 'Passw0rd!23';
  const login = async (u: string) => ((await request(server).post('/api/v1/auth/login').send({ username: u, password: PW }).expect(201)).body as Json).accessToken as string;
  const healthItems = async (token: string) => {
    const r = (await request(server).get('/api/v1/workspace/todos').set({ Authorization: `Bearer ${token}` }).expect(200)).body as Json;
    return (r.items as Json[]).filter((i) => String(i.key).endsWith(':健康证') && i.title.includes('健康证'));
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    adminToken = await login('admin');
  });
  afterAll(async () => {
    await app.close();
  });

  it('健康证 20 天后到期 → 员工本人/同部门负责人/店长有提醒；别的部门负责人、普通员工没有；过期的也提醒；还早的不提醒', async () => {
    const storeId = ((await request(server).get('/api/v1/platform/stores').set({ Authorization: `Bearer ${adminToken}` }).expect(200)).body as Json[]).find((s) => s.name.includes('示例店'))!.id as string;
    const store = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });
    const mkDept = (n: string) => prisma.department.create({ data: { tenantId: store.tenantId, storeId, code: `hc_${n}_${tag}`, name: `健康证测试部${n}`, createdBy: 'test' } });
    const [d1, d2] = [await mkDept('甲'), await mkDept('乙')];
    const mkAcc = async (u: string, name: string, departmentId: string) => {
      const a = (await request(server).post('/api/v1/platform/accounts').set({ Authorization: `Bearer ${adminToken}` }).send({ username: `${u}_${tag}`, realName: name, password: PW, storeId }).expect(201)).body as Json;
      await prisma.account.update({ where: { id: a.id }, data: { departmentId } });
      return a.id as string;
    };
    const emp = await mkAcc('hcemp', '健康证员工', d1.id);
    const head1 = await mkAcc('hchead1', '甲部负责人', d1.id);
    const head2 = await mkAcc('hchead2', '乙部负责人', d2.id);
    const deptHead = await prisma.role.findFirstOrThrow({ where: { tenantId: store.tenantId, code: 'DEPT_HEAD' } });
    for (const acc of [head1, head2]) await prisma.accountRoleAssignment.create({ data: { tenantId: store.tenantId, accountId: acc, roleId: deptHead.id, scopeType: 'STORE', scopeId: storeId, grantedBy: 'test' } });
    const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
    const profile = (accountId: string, no: string, days: number) => request(server).post('/api/v1/hr/employee-profiles').set({ Authorization: `Bearer ${adminToken}` }).send({ accountId, employeeNo: `${no}_${tag}`, hireDate: '2025-01-01', healthCertExpiresAt: inDays(days) }).expect(201);
    await profile(emp, 'HC1', 20);

    const empT = await healthItems(await login(`hcemp_${tag}`));
    expect(empT).toHaveLength(1);
    expect(empT[0].title).toBe('你的健康证20 天后到期');
    const h1 = await healthItems(await login(`hchead1_${tag}`));
    expect(h1.map((i) => i.title)).toContain('健康证员工 的健康证20 天后到期');
    expect((await healthItems(await login(`hchead2_${tag}`))).map((i) => i.title).join()).not.toContain('健康证员工'); // 别的部门负责人看不到
    expect((await healthItems(await login('store_manager'))).map((i) => i.title)).toContain('健康证员工 的健康证20 天后到期'); // 店长
    expect((await healthItems(await login('store_staff'))).map((i) => i.title).join()).not.toContain('健康证员工'); // 普通员工看不到

    // 还有 60 天才到期的不提醒；已过期 3 天的提醒（标红）
    const far = await mkAcc('hcfar', '健康证员工远', d1.id);
    await profile(far, 'HC2', 60);
    const old = await mkAcc('hcold', '健康证员工过期', d1.id);
    await profile(old, 'HC3', -3);
    const t = await healthItems(await login(`hchead1_${tag}`));
    expect(t.map((i) => i.title).join()).not.toContain('健康证员工远');
    const exp = t.find((i) => i.title.includes('健康证员工过期'))!;
    expect(exp.title).toContain('已过期');
    expect(exp.overdue).toBe(true);
    expect(exp.level).toBe('danger');
  });
});
