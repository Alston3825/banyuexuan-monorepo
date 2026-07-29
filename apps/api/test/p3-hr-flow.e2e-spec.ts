import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import type { CommissionRecord, EmployeeProfile, PayrollRecord, ScheduleEntry, ShiftDefinition, WorkflowInstance } from '@prisma/client';
import { AppModule } from '../src/app.module';

/**
 * P3 人事排班薪酬端到端集成测试：员工档案(Account的HR扩展)+班次定义+排班登记+到期提醒
 * -> 提成记录(双类型统一模型，审批复用工作流引擎) -> 薪资单(汇总当期已批准提成，2级审批
 * ->标记发放)。
 *
 * 业务规则依据：docs/竞品分析-一月妈咪月子中心管理系统功能架构逆向分析.md 3.9 节 +
 * docs/业务规则确认记录.md「2026-07-29 P3人事排班薪酬启动」章节的范围收窄记录。
 * 审批测试风格与 p3-inventory-flow.e2e-spec.ts 一致：STORE_MANAGER 角色由 store_manager
 * 与 test_user 两个账号共同持有，单节点需两者都批准；HR_PAYROLL 是2级（店长初审->超管终审）。
 */
describe('P3 人事域：员工档案+排班+提成+薪资单 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;

  const SEED_PASSWORD = 'Passw0rd!23';
  const runTag = Date.now().toString().slice(-8);
  const currentPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM

  let adminToken: string;
  let storeManagerToken: string;
  let otherStoreManagerToken: string;
  let storeId: string;

  function authed(token: string) {
    return { Authorization: `Bearer ${token}` };
  }
  function body<T>(res: request.Response): T {
    return res.body as T;
  }
  interface LoginResponse {
    accessToken: string;
  }

  let emp1ProfileId: string;
  let emp2ProfileId: string;
  let shiftDefinitionId: string;
  let scheduleEntryId: string;
  let commissionRecordId: string;
  let payrollRecordId: string;

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
  });

  afterAll(async () => {
    await app.close();
  });

  // ==================== 员工档案 ====================

  it('1. 建立员工档案：健康证30天内到期，触发到期提醒', async () => {
    const account1 = await request(server)
      .post('/api/v1/platform/accounts')
      .set(authed(adminToken))
      .send({ username: `emp1_${runTag}`, realName: 'E2E员工甲', password: 'Passw0rd!23', storeId })
      .expect(201);
    const account1Id = body<{ id: string }>(account1).id;

    const soon = new Date();
    soon.setDate(soon.getDate() + 10);

    const profile1 = await request(server)
      .post('/api/v1/hr/employee-profiles')
      .set(authed(adminToken))
      .send({
        accountId: account1Id,
        employeeNo: `E1_${runTag}`,
        hireDate: '2025-01-01',
        healthCertExpiresAt: soon.toISOString(),
      })
      .expect(201);
    emp1ProfileId = body<EmployeeProfile>(profile1).id;
    expect(body<EmployeeProfile>(profile1).status).toBe('ACTIVE');

    const account2 = await request(server)
      .post('/api/v1/platform/accounts')
      .set(authed(adminToken))
      .send({ username: `emp2_${runTag}`, realName: 'E2E员工乙', password: 'Passw0rd!23', storeId })
      .expect(201);
    const account2Id = body<{ id: string }>(account2).id;
    const profile2 = await request(server)
      .post('/api/v1/hr/employee-profiles')
      .set(authed(adminToken))
      .send({ accountId: account2Id, employeeNo: `E2_${runTag}`, hireDate: '2025-02-01' })
      .expect(201);
    emp2ProfileId = body<EmployeeProfile>(profile2).id;

    const alerts = await request(server).get('/api/v1/hr/employee-profiles/expiry-alerts').query({ withinDays: 30 }).set(authed(adminToken)).expect(200);
    const list = body<(EmployeeProfile & { alerts: { type: string }[] })[]>(alerts);
    const emp1Alert = list.find((p) => p.id === emp1ProfileId);
    expect(emp1Alert).toBeTruthy();
    expect(emp1Alert!.alerts.some((a) => a.type === 'HEALTH_CERT')).toBe(true);
  });

  it('2. 同一账号不可重复建立员工档案', async () => {
    const profile = await request(server).get(`/api/v1/hr/employee-profiles/${emp1ProfileId}`).set(authed(adminToken)).expect(200);
    const accountId = body<EmployeeProfile>(profile).accountId;
    const res = await request(server)
      .post('/api/v1/hr/employee-profiles')
      .set(authed(adminToken))
      .send({ accountId, employeeNo: `DUP_${runTag}`, hireDate: '2025-01-01' })
      .expect(400);
    expect(body<{ message: string }>(res).message).toContain('已建立员工档案');
  });

  // ==================== 排班 ====================

  it('3. 创建班次定义+排班登记：同一员工同一天不可重复排班', async () => {
    const shift = await request(server)
      .post('/api/v1/hr/shift-definitions')
      .set(authed(adminToken))
      .send({ storeId, code: `day_${runTag}`, name: '白班', startTime: '08:00', endTime: '16:00' })
      .expect(201);
    shiftDefinitionId = body<ShiftDefinition>(shift).id;

    const entry = await request(server)
      .post('/api/v1/hr/schedule-entries')
      .set(authed(adminToken))
      .send({ storeId, employeeProfileId: emp1ProfileId, workDate: '2027-01-05', shiftDefinitionId })
      .expect(201);
    scheduleEntryId = body<ScheduleEntry>(entry).id;

    const dup = await request(server)
      .post('/api/v1/hr/schedule-entries')
      .set(authed(adminToken))
      .send({ storeId, employeeProfileId: emp1ProfileId, workDate: '2027-01-05', shiftDefinitionId })
      .expect(400);
    expect(body<{ message: string }>(dup).message).toContain('已有排班');
  });

  it('4. 修改排班记录，再删除', async () => {
    const shift2 = await request(server)
      .post('/api/v1/hr/shift-definitions')
      .set(authed(adminToken))
      .send({ storeId, code: `night_${runTag}`, name: '夜班', startTime: '22:00', endTime: '06:00' })
      .expect(201);
    const shift2Id = body<ShiftDefinition>(shift2).id;

    const updated = await request(server)
      .patch(`/api/v1/hr/schedule-entries/${scheduleEntryId}`)
      .set(authed(adminToken))
      .send({ shiftDefinitionId: shift2Id, version: 0 })
      .expect(200);
    expect(body<ScheduleEntry>(updated).shiftDefinitionId).toBe(shift2Id);

    await request(server).delete(`/api/v1/hr/schedule-entries/${scheduleEntryId}`).set(authed(adminToken)).expect(200);
    const list = await request(server).get('/api/v1/hr/schedule-entries').query({ employeeProfileId: emp1ProfileId }).set(authed(adminToken)).expect(200);
    expect(body<ScheduleEntry[]>(list).find((e) => e.id === scheduleEntryId)).toBeUndefined();
  });

  // ==================== 提成记录 ====================

  it('5. 提成分配明细合计超出总金额应被拒绝', async () => {
    const res = await request(server)
      .post('/api/v1/hr/commission-records')
      .set(authed(adminToken))
      .send({
        storeId,
        type: 'SALES',
        sourceType: 'PAYMENT',
        sourceId: `fake-payment-${runTag}`,
        totalAmount: 10000,
        allocations: [
          { employeeProfileId: emp1ProfileId, roleLabel: '销售', basisPoints: 8000 },
          { employeeProfileId: emp2ProfileId, roleLabel: '店长', basisPoints: 5000 },
        ],
      })
      .expect(400);
    expect(body<{ message: string }>(res).message).toContain('超出提成总金额');
  });

  it('6. 创建提成记录：提交审批，双店长批准后懒同步为APPROVED', async () => {
    const created = await request(server)
      .post('/api/v1/hr/commission-records')
      .set(authed(adminToken))
      .send({
        storeId,
        type: 'SALES',
        sourceType: 'PAYMENT',
        sourceId: `fake-payment-${runTag}`,
        totalAmount: 10000,
        allocations: [
          { employeeProfileId: emp1ProfileId, roleLabel: '销售', basisPoints: 6000 },
          { employeeProfileId: emp2ProfileId, roleLabel: '店长', basisPoints: 3000 },
        ],
      })
      .expect(201);
    commissionRecordId = body<CommissionRecord & { allocations: { employeeProfileId: string; amount: number }[] }>(created).id;
    const allocations = body<CommissionRecord & { allocations: { employeeProfileId: string; amount: number }[] }>(created).allocations;
    expect(allocations.find((a) => a.employeeProfileId === emp1ProfileId)!.amount).toBe(6000);
    expect(allocations.find((a) => a.employeeProfileId === emp2ProfileId)!.amount).toBe(3000);

    const submitted = await request(server).post(`/api/v1/hr/commission-records/${commissionRecordId}/submit`).set(authed(adminToken)).send({ version: 0 }).expect(201);
    expect(body<CommissionRecord>(submitted).status).toBe('PENDING_APPROVAL');

    const instanceId = await findInstanceId('COMMISSION_RECORD', commissionRecordId);
    await approveByBothStoreManagers(instanceId);

    const reconciled = await request(server).get(`/api/v1/hr/commission-records/${commissionRecordId}`).set(authed(adminToken)).expect(200);
    expect(body<CommissionRecord>(reconciled).status).toBe('APPROVED');
  });

  // ==================== 薪资单 ====================

  it('7. 创建薪资单：commissionTotal 自动汇总当期已批准提成', async () => {
    const created = await request(server)
      .post('/api/v1/hr/payroll-records')
      .set(authed(adminToken))
      .send({ storeId, employeeProfileId: emp1ProfileId, period: currentPeriod, baseSalary: 50000, deductions: 1000 })
      .expect(201);
    payrollRecordId = body<PayrollRecord>(created).id;
    expect(body<PayrollRecord>(created).commissionTotal).toBe(6000);
    expect(body<PayrollRecord>(created).netAmount).toBe(50000 + 6000 - 1000);
  });

  it('8. 同一员工同一期薪资单不可重复创建', async () => {
    const res = await request(server)
      .post('/api/v1/hr/payroll-records')
      .set(authed(adminToken))
      .send({ storeId, employeeProfileId: emp1ProfileId, period: currentPeriod, baseSalary: 50000 })
      .expect(400);
    expect(body<{ message: string }>(res).message).toContain('已存在');
  });

  it('9. 薪资单提交2级审批（店长初审->超管终审），审批完成后标记发放', async () => {
    const submitted = await request(server).post(`/api/v1/hr/payroll-records/${payrollRecordId}/submit`).set(authed(adminToken)).send({ version: 0 }).expect(201);
    expect(body<PayrollRecord>(submitted).status).toBe('PENDING_APPROVAL');

    const instanceId = await findInstanceId('PAYROLL_RECORD', payrollRecordId);
    // 第一级：店长初审。
    await approveByBothStoreManagers(instanceId);
    let reconciled = await request(server).get(`/api/v1/hr/payroll-records/${payrollRecordId}`).set(authed(adminToken)).expect(200);
    expect(body<PayrollRecord>(reconciled).status).toBe('PENDING_APPROVAL'); // 还差第二级

    // 第二级：平台管理员终审。
    await request(server).post(`/api/v1/workflow/instances/${instanceId}/approve`).set(authed(adminToken)).send({ comment: '终审通过' }).expect(201);
    reconciled = await request(server).get(`/api/v1/hr/payroll-records/${payrollRecordId}`).set(authed(adminToken)).expect(200);
    expect(body<PayrollRecord>(reconciled).status).toBe('APPROVED');

    const paid = await request(server)
      .post(`/api/v1/hr/payroll-records/${payrollRecordId}/mark-paid`)
      .set(authed(adminToken))
      .send({ version: body<PayrollRecord>(reconciled).version })
      .expect(201);
    expect(body<PayrollRecord>(paid).status).toBe('PAID');
    expect(body<PayrollRecord>(paid).paidAt).toBeTruthy();
  });

  // ==================== 取消 / 乐观锁 / 权限 ====================

  it('10. 提成记录：错误版本号提交应返回409；PENDING_APPROVAL可以取消', async () => {
    const created = await request(server)
      .post('/api/v1/hr/commission-records')
      .set(authed(adminToken))
      .send({
        storeId,
        type: 'LABOR',
        sourceType: 'SERVICE_APPOINTMENT',
        sourceId: `fake-appt-${runTag}`,
        totalAmount: 5000,
        allocations: [{ employeeProfileId: emp1ProfileId, roleLabel: '第一服务人', basisPoints: 10000 }],
      })
      .expect(201);
    const id = body<CommissionRecord>(created).id;

    await request(server).post(`/api/v1/hr/commission-records/${id}/submit`).set(authed(adminToken)).send({ version: 9 }).expect(409);

    const submitted = await request(server).post(`/api/v1/hr/commission-records/${id}/submit`).set(authed(adminToken)).send({ version: 0 }).expect(201);
    expect(body<CommissionRecord>(submitted).status).toBe('PENDING_APPROVAL');

    const cancelled = await request(server)
      .post(`/api/v1/hr/commission-records/${id}/cancel`)
      .set(authed(adminToken))
      .send({ cancelReason: '业绩已撤销', version: body<CommissionRecord>(submitted).version })
      .expect(201);
    expect(body<CommissionRecord>(cancelled).status).toBe('CANCELLED');
  });

  it('11. 权限：店长可以查看员工档案、创建排班（人事日常操作全部开放）', async () => {
    await request(server).get('/api/v1/hr/employee-profiles').set(authed(storeManagerToken)).expect(200);
    await request(server)
      .post('/api/v1/hr/shift-definitions')
      .set(authed(storeManagerToken))
      .send({ storeId, code: `sm_shift_${runTag}`, name: '店长自建班次', startTime: '09:00', endTime: '17:00' })
      .expect(201);
  });
});
