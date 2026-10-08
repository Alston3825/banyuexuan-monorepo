import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { DEFAULT_ROLES, resolveDefaultCodes } from '../src/platform/role/role-defaults';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 岗位角色的默认权限清单：清单里的权限编码都真实存在；部门负责人很窄；护理长不含审核；“恢复默认权限”能撤销多余的、补回缺的。 */
describe('P8 默认权限清单 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let prisma: PrismaService;
  let adminToken: string;
  let managerToken: string;
  let allCodes: string[];
  const authed = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    const login = async (u: string) => ((await request(server).post('/api/v1/auth/login').send({ username: u, password: 'Passw0rd!23' }).expect(201)).body as Json).accessToken as string;
    adminToken = await login('admin');
    managerToken = await login('store_manager');
    allCodes = (await prisma.permissionPoint.findMany({ select: { code: true } })).map((p) => p.code);
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. 清单里写的每个权限编码都真实存在（防止写错字，写错的会被悄悄忽略）', () => {
    const all = new Set(allCodes);
    const bad: string[] = [];
    for (const r of DEFAULT_ROLES) {
      for (const p of r.perms ?? []) {
        if (p.endsWith('.*')) {
          if (!allCodes.some((c) => c.startsWith(p.slice(0, -1)))) bad.push(`${r.code}:${p}`);
        } else if (!all.has(p)) bad.push(`${r.code}:${p}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('2. 部门负责人只含申购单填写+员工自助，没有账号/角色/审计等管理权限；护理长有护理日常但没有“审核”和“强制删除”', () => {
    const head = resolveDefaultCodes('DEPT_HEAD', allCodes)!;
    expect(head).toContain('inventory.purchase-request.create');
    expect(head).toContain('office.leave-request.create');
    expect(head.some((c) => c.startsWith('platform') || c.startsWith('audit') || c.startsWith('hr.payroll'))).toBe(false);
    expect(head.length).toBeLessThan(40);

    const lead = resolveDefaultCodes('NURSE_LEAD', allCodes)!;
    expect(lead).toContain('care.record.create');
    expect(lead).toContain('care.profile.update');
    expect(lead).not.toContain('care.profile.approve');
    expect(lead).not.toContain('care.profile.force-delete');
    expect(lead.some((c) => c.startsWith('platform'))).toBe(false);

    const nurse = resolveDefaultCodes('NURSE', allCodes)!;
    expect(nurse).toContain('care.record.create');
    expect(nurse).not.toContain('care.profile.create');
  });

  it('3. 恢复默认权限：多勾的“角色管理”被撤销、被取消的默认权限被补回；没有默认清单的角色/无权限的人被拒', async () => {
    const role = await prisma.role.findFirstOrThrow({ where: { code: 'DEPT_HEAD' } });
    const extra = await prisma.permissionPoint.findFirstOrThrow({ where: { code: 'platform.role.update' } });
    const own = await prisma.permissionPoint.findFirstOrThrow({ where: { code: 'inventory.purchase-request.create' } });
    // 模拟“被误勾了一堆管理权限、又少了一项”
    await request(server).put(`/api/v1/platform/roles/${role.id}/permissions`).set(authed(adminToken)).send({ grant: [extra.id], revoke: [own.id] }).expect(200);

    const pre = (await request(server).get(`/api/v1/platform/roles/${role.id}/default-permissions`).set(authed(adminToken)).expect(200)).body as Json;
    expect(pre.hasDefault).toBe(true);
    expect(pre.remove.map((p: Json) => p.code)).toContain('platform.role.update');
    expect(pre.add.map((p: Json) => p.code)).toContain('inventory.purchase-request.create');

    // 店长没有角色管理权限：不能恢复
    await request(server).post(`/api/v1/platform/roles/${role.id}/restore-defaults`).set(authed(managerToken)).expect(403);

    const res = (await request(server).post(`/api/v1/platform/roles/${role.id}/restore-defaults`).set(authed(adminToken)).expect(201)).body as Json;
    expect(res.granted).toBeGreaterThanOrEqual(1);
    expect(res.revoked).toBe(1);
    const now = (await prisma.roleOnPermission.findMany({ where: { roleId: role.id }, include: { permissionPoint: true } })).map((x) => x.permissionPoint.code).sort();
    expect(now).toEqual([...resolveDefaultCodes('DEPT_HEAD', allCodes)!].sort());

    // 没有默认清单的自定义角色
    const custom = (await request(server).post('/api/v1/platform/roles').set(authed(adminToken)).send({ code: `DFT${Date.now().toString().slice(-6)}`, name: '默认清单测试' }).expect(201)).body as Json;
    try {
      const p = (await request(server).get(`/api/v1/platform/roles/${custom.id}/default-permissions`).set(authed(adminToken)).expect(200)).body as Json;
      expect(p.hasDefault).toBe(false);
      await request(server).post(`/api/v1/platform/roles/${custom.id}/restore-defaults`).set(authed(adminToken)).expect(400);
    } finally {
      await request(server).delete(`/api/v1/platform/roles/${custom.id}`).set(authed(adminToken));
    }
  });
});
