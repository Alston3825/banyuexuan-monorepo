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
  /** 按本次运行生成两个有效的身份证号（校验位算对），避免重复跑测试时撞上上次留在库里的号码 */
  const makeIdCard = (offset: number, male: boolean) => {
    const n = Number(runTag) + offset;
    const birth = `${1950 + (n % 50)}${String(1 + (n % 12)).padStart(2, '0')}${String(1 + (n % 28)).padStart(2, '0')}`;
    const base = `110105${birth}${String(n % 100).padStart(2, '0')}${male ? 1 : 2}`;
    const w = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
    const check = '10X98765432'[base.split('').reduce((a, c, i) => a + Number(c) * w[i], 0) % 11];
    return { no: base + check, birth: `${birth.slice(0, 4)}-${birth.slice(4, 6)}-${birth.slice(6, 8)}`, wrong: base + (check === '0' ? '1' : '0') };
  };
  const idMale = makeIdCard(0, true);
  const idFemale = makeIdCard(7, false);
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
      .send({ comment: '（另一门店店长）不应该能批' })
      .expect((res) => {
        // 审批人按门店范围解析：另一门店的店长不是本店单据的审批人——单节点流程已通过(409)，多级流程里已轮到下一级(403)
        if (![403, 409].includes(res.status)) throw new Error(`另一门店店长不应能审批，实际 ${res.status}`);
      });
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

  it('2b. 员工信息表字段：合同类型/社保/身份证（自动识别性别生日）/工资卡/紧急联系人，明文返回；身份证和工号不可重复；工龄自动算', async () => {
    const url = '/api/v1/hr/employee-profiles';
    const get = async (id: string) => body<EmployeeProfile & Record<string, unknown>>(await request(server).get(`${url}/${id}`).set(authed(adminToken)).expect(200));
    const before = await get(emp1ProfileId);
    const patch = (id: string, data: Record<string, unknown>, version: number) => request(server).patch(`${url}/${id}`).set(authed(adminToken)).send({ ...data, version });

    await patch(emp1ProfileId, { idCardNo: idMale.wrong }, before.version).expect(400); // 校验位不对
    await patch(emp1ProfileId, { bankAccountNo: '12ab' }, before.version).expect(400);
    const upd = body<EmployeeProfile>(
      await patch(
        emp1ProfileId,
        {
          contractType: 'LABOR',
          socialInsurance: 'ENROLLED',
          idCardNo: idMale.no,
          bankAccountNo: '6214 8329 4513 5551',
          bankName: '招商银行西安分行雁展路支行',
          emergencyContactName: '紧急联系人甲',
          emergencyContactPhone: '13800000000',
          emergencyContactRelation: '配偶',
          address: '测试地址',
          hireDate: '2024-01-15',
        },
        before.version,
      ).expect(200),
    );
    const after = await get(emp1ProfileId);
    expect(after).toMatchObject({
      contractType: 'LABOR',
      socialInsurance: 'ENROLLED',
      idCardNo: idMale.no, // 明文，不做掩码
      bankAccountNo: '6214832945135551', // 去掉空格
      bankName: '招商银行西安分行雁展路支行',
      gender: 'MALE',
      emergencyContactRelation: '配偶',
      address: '测试地址',
    });
    expect(String(after.birthDate).slice(0, 10)).toBe(idMale.birth);
    expect(after.tenureYears).toBe(new Date().getFullYear() - 2024 - (new Date() < new Date(new Date().getFullYear(), 0, 15) ? 1 : 0));
    expect(after.departmentName).toBeNull();
    expect(upd.version).toBe(before.version + 1);

    // 身份证号、工号不能和别的员工重复
    const other = await get(emp2ProfileId);
    const dup = await patch(emp2ProfileId, { idCardNo: idMale.no }, other.version).expect(409);
    expect(body<{ message: string }>(dup).message).toContain('E2E员工甲');
    await patch(emp2ProfileId, { employeeNo: after.employeeNo }, other.version).expect(409);
    // 换另一个有效号码 → 性别识别为女；传空字符串 = 清空（性别/出生日期一起清）
    await patch(emp2ProfileId, { idCardNo: idFemale.no }, other.version).expect(200);
    expect((await get(emp2ProfileId)).gender).toBe('FEMALE');
    const cur = await get(emp2ProfileId);
    await patch(emp2ProfileId, { idCardNo: '' }, cur.version).expect(200);
    expect(await get(emp2ProfileId)).toMatchObject({ idCardNo: null, gender: null, birthDate: null });
    // 按姓名搜索
    const found = body<EmployeeProfile[]>(await request(server).get(url).query({ keyword: 'E2E员工甲' }).set(authed(adminToken)).expect(200));
    expect(found.map((p) => p.id)).toContain(emp1ProfileId);
    expect(found.map((p) => p.id)).not.toContain(emp2ProfileId);
  });

  it('2c. 账号编辑和新建是同一套字段：编辑时也能改门店/部门/班组/职位/状态，员工档案里的部门名跟着变；新建可直接选状态', async () => {
    const profile = body<EmployeeProfile>(await request(server).get(`/api/v1/hr/employee-profiles/${emp1ProfileId}`).set(authed(adminToken)).expect(200));
    const accUrl = `/api/v1/platform/accounts/${profile.accountId}`;
    const acc = body<{ version: number }>(await request(server).get(accUrl).set(authed(adminToken)).expect(200));
    const dept = body<{ id: string }>(await request(server).post('/api/v1/platform/departments').set(authed(adminToken)).send({ name: `E2E部门${runTag}`, storeId }).expect(201));
    const upd = body<{ departmentId: string; storeId: string; version: number }>(
      await request(server).patch(accUrl).set(authed(adminToken)).send({ departmentId: dept.id, storeId, version: acc.version }).expect(200),
    );
    expect(upd).toMatchObject({ departmentId: dept.id, storeId });
    const withDept = body<EmployeeProfile & { departmentName: string | null }>(await request(server).get(`/api/v1/hr/employee-profiles/${emp1ProfileId}`).set(authed(adminToken)).expect(200));
    expect(withDept.departmentName).toBe(`E2E部门${runTag}`);
    // 传 null 清空；不传的字段不动
    const cleared = body<{ departmentId: string | null; storeId: string | null }>(await request(server).patch(accUrl).set(authed(adminToken)).send({ departmentId: null, version: upd.version }).expect(200));
    expect(cleared).toMatchObject({ departmentId: null, storeId });
    // 新建时可以直接选状态
    const created = body<{ status: string }>(
      await request(server).post('/api/v1/platform/accounts').set(authed(adminToken)).send({ username: `dis_${runTag}`, realName: 'E2E停用账号', password: 'Passw0rd!23', storeId, status: 'DISABLED' }).expect(201),
    );
    expect(created.status).toBe('DISABLED');

    // 员工手机号不做掩码：连没有任何特殊权限的店长账号，在列表和详情里看到的也是完整号码
    const phone = `139${runTag}0`.slice(0, 11);
    const withPhone = body<{ id: string }>(
      await request(server).post('/api/v1/platform/accounts').set(authed(adminToken)).send({ username: `ph_${runTag}`, realName: 'E2E有手机号', password: 'Passw0rd!23', storeId, phone }).expect(201),
    );
    const list = body<{ id: string; phone: string | null }[]>(await request(server).get('/api/v1/platform/accounts').set(authed(storeManagerToken)).expect(200));
    expect(list.find((a) => a.id === withPhone.id)?.phone).toBe(phone);
    expect(body<{ phone: string }>(await request(server).get(`/api/v1/platform/accounts/${withPhone.id}`).set(authed(storeManagerToken)).expect(200)).phone).toBe(phone);
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
