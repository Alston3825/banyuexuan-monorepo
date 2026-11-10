import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { WorkflowEngineService } from '../src/workflow/workflow-engine/workflow-engine.service';

/** 审批人按单据所属门店走：枣园店的单据 → 枣园店长，不是高新店长 */
describe('P9 审批按门店路由 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const tag = Date.now().toString().slice(-7);

  beforeAll(async () => {
    const m: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = m.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  }, 60000);

  it('各店店长只审本店单据', async () => {
    const engine = app.get(WorkflowEngineService);
    const store1 = await prisma.store.findFirstOrThrow({ where: { name: { contains: '示例店' } } });
    const admin = await prisma.account.findFirstOrThrow({ where: { username: 'admin' } });
    const mgr1 = await prisma.account.findFirstOrThrow({ where: { username: 'store_manager' } });
    const role = await prisma.role.findFirstOrThrow({ where: { code: 'STORE_MANAGER' } });
    const store2 = await prisma.store.create({ data: { tenantId: store1.tenantId, regionId: store1.regionId, code: `Z${tag}`, name: `枣园${tag}`, status: 'ACTIVE', createdBy: admin.id } });
    const mgr2 = await prisma.account.create({ data: { tenantId: store1.tenantId, storeId: store2.id, username: `m2_${tag}`, passwordHash: mgr1.passwordHash, realName: '枣园店长', createdBy: admin.id } });
    // 故意把本店长的角色范围设成“全租户”，也必须只走本店人
    await prisma.accountRoleAssignment.create({ data: { tenantId: store1.tenantId, accountId: mgr2.id, roleId: role.id, scopeType: 'TENANT', grantedBy: admin.id } });

    const approversOf = async (storeId: string) => {
      const inst = await engine.startInstance({ definitionCode: 'DEMO_APPROVAL', businessType: 'DEMO', businessId: `x${tag}${storeId.slice(-4)}`, title: '路由测试', storeId }, { tenantId: store1.tenantId, accountId: admin.id, storeId: null } as never);
      const rows = await prisma.workflowInstanceApprover.findMany({ where: { workflowInstanceId: inst.id, nodeSeq: inst.currentNodeSeq ?? 1 } });
      return rows.map((r) => r.accountId);
    };
    const a2 = await approversOf(store2.id);
    expect(a2).toContain(mgr2.id);
    expect(a2).not.toContain(mgr1.id);
    const a1 = await approversOf(store1.id);
    expect(a1).toContain(mgr1.id);
    expect(a1).not.toContain(mgr2.id);
  }, 60000);
});
