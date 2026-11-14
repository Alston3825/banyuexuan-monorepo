import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * 审批中心：审批进度（带姓名/时限/超时）、我的待办、催办、管理员重新指定审批人、审批流程设置（多级/或签/时限/停用）。
 * 用“示例审批单”(DEMO_APPROVAL) 做载体；测试结束把它的流程恢复成单节点店长审批，不影响其它用例。
 */
describe('P8 审批中心 / 我的待办 / 审批流程设置 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let prisma: PrismaService;
  let adminToken: string;
  let managerToken: string;
  let staffToken: string;
  let adminId: string;
  let managerId: string;
  let managerRoleId: string;

  const PASSWORD = 'Passw0rd!23';
  const authed = (t: string) => ({ Authorization: `Bearer ${t}` });
  const login = async (u: string) => (await request(server).post('/api/v1/auth/login').send({ username: u, password: PASSWORD }).expect(201)).body as Json;
  const get = (t: string, url: string) => request(server).get(`/api/v1${url}`).set(authed(t));
  const post = (t: string, url: string, body: Json = {}) => request(server).post(`/api/v1${url}`).set(authed(t)).send(body);

  async function submitDemo(title: string) {
    const created = (await post(staffToken, '/demo-approvals', { title, content: '审批中心测试' }).expect(201)).body;
    return (await post(staffToken, `/demo-approvals/${created.id}/submit`).expect(201)).body as Json; // WorkflowInstance
  }
  const progress = async (t: string, id: string) => (await get(t, `/workflow/instances/${id}/progress`).expect(200)).body as Json;
  const myTodos = async (t: string) => (await get(t, '/workspace/todos').expect(200)).body as Json;

  async function restoreFlow() {
    await request(server)
      .put('/api/v1/workflow/definitions/DEMO_APPROVAL')
      .set(authed(adminToken))
      .send({ enabled: true, nodes: [{ name: '店长审批', approverType: 'ROLE', approverRoleId: managerRoleId, approvalMode: 'ALL' }] })
      .expect(200);
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    const a = await login('admin');
    adminToken = a.accessToken;
    adminId = a.account.id;
    const m = await login('store_manager');
    managerToken = m.accessToken;
    managerId = m.account.id;
    staffToken = (await login('store_staff')).accessToken;
    managerRoleId = (await prisma.role.findFirstOrThrow({ where: { code: 'STORE_MANAGER' } })).id;
    await restoreFlow(); // 从干净的单节点流程开始
  });

  afterAll(async () => {
    await restoreFlow();
    await app.close();
  });

  let inst: Json;

  it('1. 提交后能看到审批进度：第几步、谁在审、等了多久；审批人看到“通过/驳回”，申请人看到“催办/撤回”', async () => {
    inst = await submitDemo(`进度测试${Date.now()}`);
    const forManager = await progress(managerToken, inst.id);
    expect(forManager.status).toBe('IN_REVIEW');
    expect(forManager.initiator.name).toBe('示例店前台');
    expect(forManager.nodes).toHaveLength(1);
    expect(forManager.nodes[0]).toMatchObject({ seq: 1, name: '店长审批', state: 'CURRENT' });
    expect(forManager.nodes[0].approvers.map((x: Json) => x.name)).toContain('示例店店长');
    expect(forManager.me).toMatchObject({ canApprove: true, canWithdraw: false, canUrge: false });
    const forStaff = await progress(staffToken, inst.id);
    expect(forStaff.me).toMatchObject({ canApprove: false, canWithdraw: true, canUrge: true, canReassignAsAdmin: false });
    // 按业务单据反查
    const byBiz = (await get(staffToken, '/workflow/instances/progress').query({ businessType: 'DEMO_APPROVAL', businessId: inst.businessId }).expect(200)).body;
    expect(byBiz.id).toBe(inst.id);
  });

  it('2. 待办：待审批人的“我的待办”和审批中心里出现这张单；申请人在“我发起的”里看到当前在谁手上', async () => {
    const todos = await myTodos(managerToken);
    const item = todos.items.find((i: Json) => i.link === `/workflow/instances/${inst.id}`);
    expect(item).toMatchObject({ kind: 'APPROVAL', overdue: false });
    expect(todos.byKind.APPROVAL).toBeGreaterThanOrEqual(1);
    const pending = (await get(managerToken, '/workflow/instances/approvals').query({ tab: 'pending' }).expect(200)).body as Json[];
    expect(pending.some((r) => r.instanceId === inst.id)).toBe(true);
    const mine = (await get(staffToken, '/workflow/instances/approvals').query({ tab: 'mine' }).expect(200)).body as Json[];
    expect(mine.find((r) => r.instanceId === inst.id)).toMatchObject({ status: 'IN_REVIEW', nodeName: '店长审批' });
    expect(mine.find((r) => r.instanceId === inst.id)!.waitingFor).toContain('示例店店长');
    // 没有参与的人看不到别人的待办
    expect((await myTodos(adminToken)).items.some((i: Json) => i.link === `/workflow/instances/${inst.id}`)).toBe(false);
  });

  it('3. 催办：只有申请人能催，1 小时内只能催一次；催办会在待办里体现', async () => {
    await post(managerToken, `/workflow/instances/${inst.id}/urge`).expect(403);
    await post(staffToken, `/workflow/instances/${inst.id}/urge`, { comment: '客人在等' }).expect(201);
    await post(staffToken, `/workflow/instances/${inst.id}/urge`).expect(409);
    const item = (await myTodos(managerToken)).items.find((i: Json) => i.link === `/workflow/instances/${inst.id}`);
    expect(item.desc).toContain('被催办 1 次');
    expect(item.level).toBe('warning');
  });

  it('4. 管理员重新指定审批人：审批人账号有问题导致单据卡住时，管理员把它转给别人；原审批人不能再批', async () => {
    await post(staffToken, `/workflow/instances/${inst.id}/reassign`, { toAccountId: adminId }).expect(403); // 普通员工没有这个能力
    await post(adminToken, `/workflow/instances/${inst.id}/reassign`, { toAccountId: adminId, comment: '原审批人休假' }).expect(201);
    const p = await progress(adminToken, inst.id);
    expect(p.nodes[0].approvers.find((x: Json) => x.status === 'PENDING').name).toBe('超级管理员');
    expect(p.me.canApprove).toBe(true);
    await post(managerToken, `/workflow/instances/${inst.id}/approve`, {}).expect(403);
    await post(adminToken, `/workflow/instances/${inst.id}/approve`, { comment: '同意' }).expect(201);
    expect((await progress(staffToken, inst.id)).status).toBe('APPROVED');
    expect((await myTodos(managerToken)).items.some((i: Json) => i.link === `/workflow/instances/${inst.id}`)).toBe(false);
  });

  it('5. 审批流程设置：只有管理员能改；改成两级（店长或签限时1小时 → 管理员终审），新单据按新流程走，已有单据不受影响', async () => {
    await get(managerToken, '/workflow/definitions/settings').expect(403);
    await request(server).put('/api/v1/workflow/definitions/DEMO_APPROVAL').set(authed(managerToken)).send({ enabled: false }).expect(403);
    const before = ((await get(adminToken, '/workflow/definitions/settings').expect(200)).body as Json[]).find((d) => d.code === 'DEMO_APPROVAL')!;
    const old = await submitDemo(`旧流程单${Date.now()}`); // 先提交一张，改流程时它正在审批
    const saved = (
      await request(server)
        .put('/api/v1/workflow/definitions/DEMO_APPROVAL')
        .set(authed(adminToken))
        .send({
          name: '示例审批（两级）',
          nodes: [
            { name: '店长初审', approverType: 'ROLE', approverRoleId: managerRoleId, approvalMode: 'ANY', timeoutHours: 1 },
            { name: '管理员终审', approverType: 'ACCOUNT', approverAccountId: adminId, approvalMode: 'ALL', timeoutHours: 24 },
          ],
        })
        .expect(200)
    ).body as Json;
    expect(saved.version).toBe(before.version + 1);
    expect(saved.nodes.map((n: Json) => [n.name, n.approvalMode, n.timeoutHours])).toEqual([['店长初审', 'ANY', 1], ['管理员终审', 'ALL', 24]]);

    // 旧单据仍是 1 节点
    const oldP = await progress(adminToken, old.id);
    expect(oldP.nodes).toHaveLength(1);

    // 新单据：两级
    const fresh = await submitDemo(`新流程单${Date.now()}`);
    let p = await progress(managerToken, fresh.id);
    expect(p.nodes).toHaveLength(2);
    expect(p.nodes[0]).toMatchObject({ state: 'CURRENT', mode: 'ANY', timeoutHours: 1 });
    expect(p.nodes[1]).toMatchObject({ state: 'WAITING' });
    const due = p.nodes[0].approvers[0].dueAt;
    expect(new Date(due).getTime() - new Date(p.nodes[0].approvers[0].arrivedAt).getTime()).toBe(3600_000);
    expect(p.nodes[0].approvers[0].overdue).toBe(false);

    // 超时：把待办“收到时间”往前拨 2 小时 → 变红、排进已超时
    await prisma.workflowInstanceApprover.updateMany({ where: { workflowInstanceId: fresh.id, nodeSeq: 1 }, data: { createdAt: new Date(Date.now() - 2 * 3600_000) } });
    const todo = (await myTodos(managerToken)).items.find((i: Json) => i.link === `/workflow/instances/${fresh.id}`);
    expect(todo).toMatchObject({ overdue: true, level: 'danger' });
    expect((await myTodos(managerToken)).overdue).toBeGreaterThanOrEqual(1);
    p = await progress(managerToken, fresh.id);
    expect(p.nodes[0].approvers[0].overdue).toBe(true);

    // 走完两级
    await post(managerToken, `/workflow/instances/${fresh.id}/approve`, { comment: '初审通过' }).expect(201);
    p = await progress(adminToken, fresh.id);
    expect(p.nodes[0].state).toBe('DONE');
    expect(p.nodes[1].state).toBe('CURRENT');
    expect(p.me.canApprove).toBe(true);
    await post(managerToken, `/workflow/instances/${fresh.id}/approve`, {}).expect(403); // 终审不是店长
    await post(adminToken, `/workflow/instances/${fresh.id}/approve`, { comment: '终审通过' }).expect(201);
    expect((await progress(adminToken, fresh.id)).status).toBe('APPROVED');

    // 旧单据照旧一级审批
    await post(managerToken, `/workflow/instances/${old.id}/approve`, {}).expect(201);
    expect((await progress(adminToken, old.id)).status).toBe('APPROVED');
  });

  it('6. 停用：停用后提交审批会提示联系管理员；启用后恢复。节点校验：角色/审批人不能为空', async () => {
    await request(server).put('/api/v1/workflow/definitions/DEMO_APPROVAL').set(authed(adminToken)).send({ enabled: false }).expect(200);
    const created = (await post(staffToken, '/demo-approvals', { title: '停用测试', content: 'x' }).expect(201)).body;
    const res = await post(staffToken, `/demo-approvals/${created.id}/submit`).expect(404);
    expect(res.body.message).toContain('已停用');
    await request(server).put('/api/v1/workflow/definitions/DEMO_APPROVAL').set(authed(adminToken)).send({ enabled: true }).expect(200);
    await post(staffToken, `/demo-approvals/${created.id}/submit`).expect(201);

    const bad = (nodes: Json[]) => request(server).put('/api/v1/workflow/definitions/DEMO_APPROVAL').set(authed(adminToken)).send({ nodes }).expect(400);
    await bad([]);
    await bad([{ name: '无角色', approverType: 'ROLE', approvalMode: 'ALL' }]);
    await bad([{ name: '无人', approverType: 'ACCOUNT', approvalMode: 'ALL' }]);
    await request(server).put('/api/v1/workflow/definitions/NOT_EXIST').set(authed(adminToken)).send({ enabled: true }).expect(404);
  });

  it('7. 审批人是已停用账号时：提交会直接提示没有可审批的人，而不是悄悄卡死', async () => {
    const ghost = await prisma.account.findFirstOrThrow({ where: { username: 'store_staff' } });
    // 把第一节点改成“指定一位已停用员工”不被允许（保存时校验在职）
    await request(server)
      .put('/api/v1/workflow/definitions/DEMO_APPROVAL')
      .set(authed(adminToken))
      .send({ nodes: [{ name: '停用的人', approverType: 'ACCOUNT', approverAccountId: ghost.id, approvalMode: 'ALL' }] })
      .expect(200);
    await prisma.account.update({ where: { id: ghost.id }, data: { status: 'DISABLED' } });
    try {
      const staffLoginAgain = adminToken; // 申请人用管理员（store_staff 已停用）
      const created = (await post(staffLoginAgain, '/demo-approvals', { title: '无人审批', content: 'x' }).expect(201)).body;
      const res = await post(staffLoginAgain, `/demo-approvals/${created.id}/submit`).expect(409);
      expect(res.body.message).toContain('没有可审批的人');
    } finally {
      await prisma.account.update({ where: { id: ghost.id }, data: { status: 'ACTIVE' } });
      await restoreFlow();
    }
    void managerId;
  });

  it('8. 指定多位员工（或签选 2～3 人）：每人都收到待办，任意一人通过即通过；设置页回显所有人名；有离职/不存在的人保存被拒', async () => {
    const put = (nodes: Json[]) => request(server).put('/api/v1/workflow/definitions/DEMO_APPROVAL').set(authed(adminToken)).send({ nodes });
    const saved = (await put([{ name: '多人或签', approverType: 'ACCOUNT', approverAccountIds: [managerId, adminId], approvalMode: 'ANY' }]).expect(200)).body as Json;
    expect(saved.nodes[0].approverAccountIds).toEqual([managerId, adminId]);
    expect(saved.nodes[0].approverLabel).toContain('、');
    await put([{ name: '含不存在的人', approverType: 'ACCOUNT', approverAccountIds: [managerId, 'no-such-account'], approvalMode: 'ANY' }]).expect(400);

    const inst = await submitDemo(`多人或签${Date.now()}`);
    const p = await progress(adminToken, inst.id);
    expect(p.nodes[0].approvers.map((a: Json) => a.accountId).sort()).toEqual([managerId, adminId].sort());
    expect(p.nodes[0].planned).toContain('、');
    expect((await myTodos(managerToken)).items.some((i: Json) => i.link === `/workflow/instances/${inst.id}`)).toBe(true);
    expect((await myTodos(adminToken)).items.some((i: Json) => i.link === `/workflow/instances/${inst.id}`)).toBe(true);
    await post(managerToken, `/workflow/instances/${inst.id}/approve`, { comment: '或签一人通过' }).expect(201);
    expect((await progress(adminToken, inst.id)).status).toBe('APPROVED'); // 或签：一人通过整个节点通过

    // 会签：两人都要通过
    await put([{ name: '多人会签', approverType: 'ACCOUNT', approverAccountIds: [managerId, adminId], approvalMode: 'ALL' }]).expect(200);
    const inst2 = await submitDemo(`多人会签${Date.now()}`);
    await post(managerToken, `/workflow/instances/${inst2.id}/approve`, {}).expect(201);
    expect((await progress(adminToken, inst2.id)).status).toBe('IN_REVIEW');
    await post(adminToken, `/workflow/instances/${inst2.id}/approve`, {}).expect(201);
    expect((await progress(adminToken, inst2.id)).status).toBe('APPROVED');
    await restoreFlow();
  });

  it('9. 审批角色可多选，且可和指定员工同时选：角色成员 + 指定员工 合在一起都是审批人', async () => {
    const put = (nodes: Json[]) => request(server).put('/api/v1/workflow/definitions/DEMO_APPROVAL').set(authed(adminToken)).send({ nodes });
    const superRole = await prisma.role.findFirstOrThrow({ where: { code: 'SUPER_ADMIN' } });
    // 两个角色（店长 + 超级管理员）
    const s1 = (await put([{ name: '多角色', approverType: 'ROLE', approverRoleIds: [managerRoleId, superRole.id], approvalMode: 'ANY' }]).expect(200)).body as Json;
    expect(s1.nodes[0].approverRoleIds).toEqual([managerRoleId, superRole.id]);
    expect(s1.nodes[0].approverLabel).toContain('角色：');
    const i1 = await submitDemo(`多角色${Date.now()}`);
    const p1 = await progress(adminToken, i1.id);
    expect(p1.nodes[0].approvers.map((a: Json) => a.accountId)).toEqual(expect.arrayContaining([managerId, adminId]));
    await post(managerToken, `/workflow/instances/${i1.id}/approve`, {}).expect(201);
    expect((await progress(adminToken, i1.id)).status).toBe('APPROVED');

    // 角色 + 指定员工同时选（店长角色 + 指定管理员）
    await put([{ name: '角色加员工', approverType: 'ROLE', approverRoleIds: [managerRoleId], approverAccountIds: [adminId], approvalMode: 'ANY' }]).expect(200);
    const i2 = await submitDemo(`角色加员工${Date.now()}`);
    const p2 = await progress(adminToken, i2.id);
    expect(p2.nodes[0].approvers.map((a: Json) => a.accountId).sort()).toEqual([managerId, adminId].sort());
    expect(p2.nodes[0].planned).toContain('角色：');
    expect(p2.nodes[0].planned).toContain('指定：');
    await post(adminToken, `/workflow/instances/${i2.id}/approve`, {}).expect(201);
    expect((await progress(adminToken, i2.id)).status).toBe('APPROVED');
    await restoreFlow();
  });
});
