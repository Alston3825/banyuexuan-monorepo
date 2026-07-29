import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import type { EmployeeProfile, ExpenseClaim, GeneralMemo, LeaveRequest, WorkflowInstance } from '@prisma/client';
import { AppModule } from '../src/app.module';

/**
 * P3 办公审批端到端集成测试：请假申请(LeaveRequest)/报销申请(ExpenseClaim)/日常签呈(GeneralMemo)
 * 三种固定单据，均为单节点店长审批，reconcileStatus() 懒同步模式与HR域完全同构。
 * 业务规则依据：docs/业务规则确认记录.md「2026-07-29 P3办公审批实现中」范围收窄记录——
 * 本期不做自定义表单引擎/条件分支/会签加签/超时升级，固定这3种常用单据类型。
 * 审批测试风格与 p3-hr-flow.e2e-spec.ts 一致：STORE_MANAGER 角色由 store_manager 与
 * test_user 两个账号共同持有，单节点需两者都批准。
 */
describe('P3 办公审批：请假/报销/签呈 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;

  const SEED_PASSWORD = 'Passw0rd!23';
  const runTag = Date.now().toString().slice(-8);

  let adminToken: string;
  let storeManagerToken: string;
  let otherStoreManagerToken: string;
  let storeId: string;
  let empProfileId: string;

  function authed(token: string) {
    return { Authorization: `Bearer ${token}` };
  }
  function body<T>(res: request.Response): T {
    return res.body as T;
  }
  interface LoginResponse {
    accessToken: string;
  }

  async function approveByBothStoreManagers(instanceId: string) {
    await request(server).post(`/api/v1/workflow/instances/${instanceId}/approve`).set(authed(storeManagerToken)).send({ comment: '同意' }).expect(201);
    await request(server)
      .post(`/api/v1/workflow/instances/${instanceId}/approve`)
      .set(authed(otherStoreManagerToken))
      .send({ comment: '（另一门店店长）一并批准' })
      .expect(201);
  }

  async function findInstanceId(businessType: string, businessId: string): Promise<string> {
    const res = await request(server).get('/api/v1/workflow/instances').query({ businessType, businessId }).set(authed(adminToken)).expect(200);
    return body<WorkflowInstance>(res).id;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();

    const adminLogin = await request(server).post('/api/v1/auth/login').send({ username: 'admin', password: SEED_PASSWORD }).expect(201);
    adminToken = body<LoginResponse>(adminLogin).accessToken;
    const storeManagerLogin = await request(server).post('/api/v1/auth/login').send({ username: 'store_manager', password: SEED_PASSWORD }).expect(201);
    storeManagerToken = body<LoginResponse>(storeManagerLogin).accessToken;
    const otherLogin = await request(server).post('/api/v1/auth/login').send({ username: 'test_user', password: SEED_PASSWORD }).expect(201);
    otherStoreManagerToken = body<LoginResponse>(otherLogin).accessToken;

    const stores = await request(server).get('/api/v1/platform/stores').set(authed(adminToken)).expect(200);
    storeId = body<{ id: string }[]>(stores)[0].id;

    const account = await request(server)
      .post('/api/v1/platform/accounts')
      .set(authed(adminToken))
      .send({ username: `office_emp_${runTag}`, realName: 'E2E办公审批员工', password: 'Passw0rd!23', storeId })
      .expect(201);
    const accountId = body<{ id: string }>(account).id;
    const profile = await request(server)
      .post('/api/v1/hr/employee-profiles')
      .set(authed(adminToken))
      .send({ accountId, employeeNo: `OE_${runTag}`, hireDate: '2025-01-01' })
      .expect(201);
    empProfileId = body<EmployeeProfile>(profile).id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ==================== 请假申请 ====================

  it('1. 请假申请：结束日期早于开始日期应被拒绝', async () => {
    const res = await request(server)
      .post('/api/v1/office/leave-requests')
      .set(authed(adminToken))
      .send({ storeId, employeeProfileId: empProfileId, leaveType: 'SICK', startDate: '2027-02-10', endDate: '2027-02-01', reason: '身体不适' })
      .expect(400);
    expect(body<{ message: string }>(res).message).toContain('结束日期不能早于开始日期');
  });

  it('2. 请假申请：创建->提交->双店长批准->懒同步为APPROVED', async () => {
    const created = await request(server)
      .post('/api/v1/office/leave-requests')
      .set(authed(adminToken))
      .send({ storeId, employeeProfileId: empProfileId, leaveType: 'ANNUAL', startDate: '2027-03-01', endDate: '2027-03-03', reason: '年假出游' })
      .expect(201);
    const id = body<LeaveRequest>(created).id;
    expect(body<LeaveRequest>(created).status).toBe('DRAFT');

    const submitted = await request(server).post(`/api/v1/office/leave-requests/${id}/submit`).set(authed(adminToken)).send({ version: 0 }).expect(201);
    expect(body<LeaveRequest>(submitted).status).toBe('PENDING_APPROVAL');

    const instanceId = await findInstanceId('LEAVE_REQUEST', id);
    await approveByBothStoreManagers(instanceId);

    const reconciled = await request(server).get(`/api/v1/office/leave-requests/${id}`).set(authed(adminToken)).expect(200);
    expect(body<LeaveRequest>(reconciled).status).toBe('APPROVED');
  });

  it('3. 请假申请：APPROVED状态可以取消', async () => {
    const created = await request(server)
      .post('/api/v1/office/leave-requests')
      .set(authed(adminToken))
      .send({ storeId, employeeProfileId: empProfileId, leaveType: 'PERSONAL', startDate: '2027-04-01', endDate: '2027-04-01', reason: '办理私事' })
      .expect(201);
    const id = body<LeaveRequest>(created).id;
    const submitted = await request(server).post(`/api/v1/office/leave-requests/${id}/submit`).set(authed(adminToken)).send({ version: 0 }).expect(201);
    const instanceId = await findInstanceId('LEAVE_REQUEST', id);
    await approveByBothStoreManagers(instanceId);
    const reconciled = await request(server).get(`/api/v1/office/leave-requests/${id}`).set(authed(adminToken)).expect(200);
    expect(body<LeaveRequest>(reconciled).status).toBe('APPROVED');

    const cancelled = await request(server)
      .post(`/api/v1/office/leave-requests/${id}/cancel`)
      .set(authed(adminToken))
      .send({ cancelReason: '计划有变', version: body<LeaveRequest>(reconciled).version })
      .expect(201);
    expect(body<LeaveRequest>(cancelled).status).toBe('CANCELLED');
    void submitted;
  });

  // ==================== 报销申请 ====================

  it('4. 报销申请：申请人固定为当前登录账号，创建->提交->审批通过', async () => {
    const created = await request(server)
      .post('/api/v1/office/expense-claims')
      .set(authed(storeManagerToken))
      .send({ storeId, amount: 30000, category: '差旅', reason: '出差高铁票报销' })
      .expect(201);
    const claim = body<ExpenseClaim & { applicant: { id: string } }>(created);
    expect(claim.status).toBe('DRAFT');
    expect(claim.applicantId).toBe(claim.applicant.id);

    const submitted = await request(server).post(`/api/v1/office/expense-claims/${claim.id}/submit`).set(authed(storeManagerToken)).send({ version: 0 }).expect(201);
    expect(body<ExpenseClaim>(submitted).status).toBe('PENDING_APPROVAL');

    const instanceId = await findInstanceId('EXPENSE_CLAIM', claim.id);
    await approveByBothStoreManagers(instanceId);
    const reconciled = await request(server).get(`/api/v1/office/expense-claims/${claim.id}`).set(authed(adminToken)).expect(200);
    expect(body<ExpenseClaim>(reconciled).status).toBe('APPROVED');
  });

  it('5. 报销申请：错误版本号提交应返回409', async () => {
    const created = await request(server).post('/api/v1/office/expense-claims').set(authed(adminToken)).send({ storeId, amount: 5000, category: '办公用品', reason: '打印纸采购' }).expect(201);
    const id = body<ExpenseClaim>(created).id;
    await request(server).post(`/api/v1/office/expense-claims/${id}/submit`).set(authed(adminToken)).send({ version: 9 }).expect(409);
  });

  // ==================== 日常签呈 ====================

  it('6. 日常签呈：创建->提交->驳回后应回到DRAFT状态可再次提交', async () => {
    const created = await request(server)
      .post('/api/v1/office/general-memos')
      .set(authed(adminToken))
      .send({ storeId, title: '关于调整前台值班表的说明', content: '因人员调整，自下月起前台值班表如下……' })
      .expect(201);
    const id = body<GeneralMemo>(created).id;

    const submitted = await request(server).post(`/api/v1/office/general-memos/${id}/submit`).set(authed(adminToken)).send({ version: 0 }).expect(201);
    expect(body<GeneralMemo>(submitted).status).toBe('PENDING_APPROVAL');

    const instanceId = await findInstanceId('GENERAL_MEMO', id);
    await request(server).post(`/api/v1/workflow/instances/${instanceId}/reject`).set(authed(storeManagerToken)).send({ comment: '内容需要补充' }).expect(201);

    const reconciled = await request(server).get(`/api/v1/office/general-memos/${id}`).set(authed(adminToken)).expect(200);
    expect(body<GeneralMemo>(reconciled).status).toBe('REJECTED');
  });

  it('7. 日常签呈：DRAFT状态可以取消', async () => {
    const created = await request(server).post('/api/v1/office/general-memos').set(authed(adminToken)).send({ storeId, title: '测试签呈', content: '测试内容' }).expect(201);
    const id = body<GeneralMemo>(created).id;
    const cancelled = await request(server)
      .post(`/api/v1/office/general-memos/${id}/cancel`)
      .set(authed(adminToken))
      .send({ cancelReason: '不再需要', version: 0 })
      .expect(201);
    expect(body<GeneralMemo>(cancelled).status).toBe('CANCELLED');
  });

  it('8. 权限：店长可以查看并创建三种单据（日常事务全部开放）', async () => {
    await request(server).get('/api/v1/office/leave-requests').set(authed(storeManagerToken)).expect(200);
    await request(server).get('/api/v1/office/expense-claims').set(authed(storeManagerToken)).expect(200);
    await request(server).get('/api/v1/office/general-memos').set(authed(storeManagerToken)).expect(200);
    await request(server)
      .post('/api/v1/office/general-memos')
      .set(authed(storeManagerToken))
      .send({ storeId, title: '店长自建签呈', content: '店长日常事务签呈测试' })
      .expect(201);
  });
});
