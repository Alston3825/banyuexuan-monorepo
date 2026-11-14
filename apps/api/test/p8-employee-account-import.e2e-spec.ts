import { readFileSync } from 'fs';
import { join } from 'path';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * 员工信息表批量开通账号 + 手机号/工号唯一 + 工号修改权限 + 离职归档释放工号。
 * 样表 fixtures/employee-import-sample.xlsx 是虚构员工，含各种问题行（缺手机号、重复、写了离职…）。
 */
describe('P8 员工信息表开通账号 / 手机号工号唯一 / 离职归档 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let prisma: PrismaService;
  let adminToken: string;
  let managerToken: string;
  let staffToken: string;
  let storeId: string;
  let staffRoleId: string;

  const SEED_PASSWORD = 'Passw0rd!23';
  const authed = (t: string) => ({ Authorization: `Bearer ${t}` });
  const sample = readFileSync(join(__dirname, 'fixtures', 'employee-import-sample.xlsx'));
  const login = (username: string, password = SEED_PASSWORD) => request(server).post('/api/v1/auth/login').send({ username, password });
  const upload = (token = adminToken) => request(server).post('/api/v1/platform/accounts/import/preview').set(authed(token)).attach('file', sample, 'employee-import-sample.xlsx');
  const status = (r: Json, code: number) => {
    expect(r.status).toBe(code);
    return r;
  };
  const PHONES = ['19900000001', '19900000002', '19900000003', '19900000006', '19900000008', '19900000011', '19900000012', '19900000020', '19900000031', '19900000032'];

  async function cleanup() {
    const accounts = await prisma.account.findMany({ where: { phone: { in: PHONES } }, select: { id: true } });
    const ids = accounts.map((a) => a.id);
    await prisma.employeeProfile.deleteMany({ where: { accountId: { in: ids } } });
    await prisma.accountRoleAssignment.deleteMany({ where: { accountId: { in: ids } } });
    await prisma.refreshToken.deleteMany({ where: { accountId: { in: ids } } });
    await prisma.staffDevice.deleteMany({ where: { accountId: { in: ids } } });
    await prisma.account.deleteMany({ where: { id: { in: ids } } });
    // 导入时自动新建的部门/职位（名字固定带“导入测试”），清掉才能每次都验证“新建”
    await prisma.position.deleteMany({ where: { name: { startsWith: '导入测试' } } });
    await prisma.department.deleteMany({ where: { name: { startsWith: '导入测试' } } });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    await cleanup(); // 样表手机号固定，重复跑测试前清掉上次开通的
    adminToken = (await login('admin').expect(201)).body.accessToken;
    managerToken = (await login('store_manager').expect(201)).body.accessToken;
    staffToken = (await login('store_staff').expect(201)).body.accessToken;
    storeId = (await request(server).get('/api/v1/platform/stores').set(authed(adminToken)).expect(200)).body.find((s: Json) => s.name.includes('示例店')).id;
    staffRoleId = (await request(server).get('/api/v1/platform/roles').set(authed(adminToken)).expect(200)).body.find((r: Json) => r.code === 'STORE_STAFF').id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  let preview: Json;

  it('1. 读员工信息表：自动认列（姓名/手机号/工号/门店/部门/职位/入职日期…），不认识的列（工龄）说明忽略；逐行检查问题', async () => {
    preview = (await upload().expect(201)).body as Json;
    expect(preview.headerRow).toBe(1);
    expect(preview.ignoredColumns).toEqual(expect.arrayContaining(['用户名', '工龄 （年）'].filter((x) => x !== '用户名')));
    expect(preview.rows).toHaveLength(8);
    const row = (n: number) => preview.rows.find((r: Json) => r.rowNo === n);
    const errors = (n: number) => row(n).issues.filter((i: Json) => i.level === 'error').map((i: Json) => i.text);
    // 第 2 行：完整，Excel 序列号日期 46023 = 2026-01-01，身份证校验通过
    expect(row(2)).toMatchObject({ employeeNo: 'IMP-001', name: '导入测试甲', phone: '19900000001', hireDate: '2026-01-01', departmentName: '导入测试护理部', storeId, newPosition: true, resigned: false });
    expect(errors(2)).toEqual([]);
    // 第 3 行：没写工号 → 系统预分配；文字日期 2026.3.5；身份证写错 → 只是提醒
    expect(row(3)).toMatchObject({ name: '导入测试乙', hireDate: '2026-03-05', employeeNoSuggested: true });
    expect(row(3).employeeNo).toBeTruthy();
    expect(errors(3)).toEqual([]);
    expect(row(3).issues.some((i: Json) => i.level === 'warn' && i.text.includes('身份证'))).toBe(true);
    // 第 4 行：备注写了离职 → 标记，不报错
    expect(row(4).resigned).toBe(true);
    expect(errors(4)).toEqual([]);
    // 问题行
    expect(errors(5).join()).toContain('缺手机号');
    expect(errors(6).join()).toContain('第 2 行手机号重复');
    expect(errors(7).join()).toContain('第 2 行工号重复');
    expect(errors(8).join()).toContain('不是 11 位手机号');
    expect(errors(9)).toEqual([]);
    expect(row(9).storeId).toBeNull(); // 门店找不到 → 提醒，用页面选的门店
    expect(row(9).issues.some((i: Json) => i.level === 'warn' && i.text.includes('找不到门店'))).toBe(true);
    // 同名不同人没问题（靠手机号/工号区分）
    expect(errors(4)).toEqual([]);
    await upload(staffToken).expect(403); // 没有新建账号权限的不能导入
  });

  it('2. 确认开通：手机号作用户名、初始密码 banyuexuan、自动新建部门职位、赋默认角色、员工档案写入合同/社保/身份证/工资卡；有问题的行不开通', async () => {
    const rows = preview.rows
      .filter((r: Json) => [2, 3, 5, 6, 9].includes(r.rowNo)) // 勾选：甲、乙，外加三个有问题/用默认门店的行
      .map(({ issues, storeId: _s, employeeNoSuggested, newDepartment, newPosition, resigned, ...r }: Json) => r);
    const res = (await request(server).post('/api/v1/platform/accounts/import/commit').set(authed(adminToken)).send({ rows, storeId, createMissing: true, roleId: staffRoleId, importProfileDetails: true }).expect(201)).body as Json;
    expect(res.created).toBe(3); // 甲、乙、辛（门店用默认）
    expect(res.failed.map((f: Json) => f.rowNo).sort()).toEqual([5, 6]); // 缺手机号、工号重复
    expect(res.failed.find((f: Json) => f.rowNo === 6).error).toContain('重复');

    // 手机号就是用户名，初始密码 banyuexuan，能登录；拿到默认角色的权限
    const loginRes = (await login('19900000001', 'banyuexuan').expect(201)).body as Json;
    expect(loginRes.account.realName).toBe('导入测试甲');
    expect(loginRes.permissions).toContain('care.profile.view');
    await login('19900000001', 'wrong').expect(401);

    const acc = (await prisma.account.findFirst({ where: { phone: '19900000001' }, include: { department: true, position: true, employeeProfile: true } }))!;
    expect(acc.username).toBe('19900000001');
    expect(acc.department?.name).toBe('导入测试护理部');
    expect(acc.department?.storeId).toBe(storeId);
    expect(acc.position?.name).toBe('导入测试护理师');
    expect(acc.employeeProfile).toMatchObject({ employeeNo: 'IMP-001', activeEmployeeNo: 'IMP-001', contractType: 'LABOR', socialInsurance: 'ENROLLED', bankName: '招商银行测试支行', gender: 'MALE' });
    expect(acc.employeeProfile!.hireDate.toISOString().slice(0, 10)).toBe('2026-01-01');
    expect(acc.employeeProfile!.idCardNo).toMatch(/^\d{17}[\dX]$/);
    // 乙：身份证写错没写入，其它照常；预分配的工号已落库
    const b = (await prisma.account.findFirst({ where: { phone: '19900000002' }, include: { employeeProfile: true } }))!;
    expect(b.employeeProfile).toMatchObject({ contractType: 'PROBATION', socialInsurance: 'NOT_ENROLLED', idCardNo: null });
    expect(b.employeeProfile!.employeeNo).toBeTruthy();
    // 辛：表里门店找不到 → 用了选择的默认门店
    expect((await prisma.account.findFirst({ where: { phone: '19900000008' } }))!.storeId).toBe(storeId);
    // 没有勾选的第 4 行（写了离职）没开通
    expect(await prisma.account.count({ where: { phone: '19900000003' } })).toBe(0);
  });

  it('3. 手机号唯一：再导入同一张表，已开通的手机号提示“已经是某某的账号”；手工新建/修改手机号撞号返回 409', async () => {
    const again = (await upload().expect(201)).body as Json;
    const r2 = again.rows.find((r: Json) => r.rowNo === 2);
    // 手机号已是系统里的账号：不再报错，提示“已有账号，不新建、不改动”（表里工号和现有相同）
    expect(r2.issues.filter((i: Json) => i.level === 'error')).toHaveLength(0);
    expect(r2.issues.map((i: Json) => i.text).join()).toContain('已有账号「导入测试甲」，不新建、不改动');
    expect(r2.existingAccountId).toBeTruthy();

    const dup = await request(server).post('/api/v1/platform/accounts').set(authed(adminToken)).send({ username: 'dup_phone_x', realName: '撞号', password: 'banyuexuan', phone: '19900000001', storeId }).expect(409);
    expect(dup.body.message).toContain('同一个手机号只能开一个账号');
    const ok = (await request(server).post('/api/v1/platform/accounts').set(authed(adminToken)).send({ username: '19900000011', realName: '导入测试壬', password: 'banyuexuan', phone: '19900000011', storeId, employeeNo: 'IMP-011', hireDate: '2026-02-01' }).expect(201)).body;
    const cur = (await request(server).get(`/api/v1/platform/accounts/${ok.id}`).set(authed(adminToken)).expect(200)).body;
    await request(server).patch(`/api/v1/platform/accounts/${ok.id}`).set(authed(adminToken)).send({ phone: '19900000002', version: cur.version }).expect(409);
    await request(server).post('/api/v1/platform/accounts').set(authed(adminToken)).send({ username: 'dup_no_x', realName: '撞工号', password: 'banyuexuan', phone: '19900000012', employeeNo: 'IMP-011', hireDate: '2026-02-01', storeId }).expect(409);
  });

  let profileId: string;
  let accountId: string;

  it('4. 工号一旦分配只有管理员能改：店长（没有“修改工号”权限）改工号被拒，其它字段能改；管理员能改且不能撞号', async () => {
    const list = (await request(server).get('/api/v1/hr/employee-profiles').query({ keyword: 'IMP-011' }).set(authed(adminToken)).expect(200)).body as Json[];
    profileId = list[0].id;
    accountId = list[0].accountId;
    const cur = async () => (await request(server).get(`/api/v1/hr/employee-profiles/${profileId}`).set(authed(adminToken)).expect(200)).body as Json;
    const patch = (token: string, data: Json) => request(server).patch(`/api/v1/hr/employee-profiles/${profileId}`).set(authed(token)).send({ ...data, version: undefined });
    const send = async (token: string, data: Json) => request(server).patch(`/api/v1/hr/employee-profiles/${profileId}`).set(authed(token)).send({ ...data, version: (await cur()).version });
    void patch;
    const denied = await send(managerToken, { employeeNo: 'IMP-099' }).then((r) => status(r, 403));
    expect(denied.body.message).toContain('只有管理员');
    await send(managerToken, { address: '店长可以改其它字段' }).then((r) => status(r, 200)); // 其它字段不受影响
    await send(adminToken, { employeeNo: 'IMP-001' }).then((r) => status(r, 409)); // 管理员也不能撞号
    await send(adminToken, { employeeNo: 'IMP-012' }).then((r) => status(r, 200));
    expect((await cur()).employeeNo).toBe('IMP-012');
    const next = (await request(server).get('/api/v1/hr/employee-profiles/next-no').set(authed(managerToken)).expect(200)).body;
    expect(next.employeeNo).toBeTruthy();
  });

  it('5. 离职归档：档案只读、账号停用不能登录、工号释放给新员工；同一手机号仍然不能重开账号', async () => {
    const cur = async () => (await request(server).get(`/api/v1/hr/employee-profiles/${profileId}`).set(authed(adminToken)).expect(200)).body as Json;
    const archive = async (token: string, body: Json = {}) => request(server).post(`/api/v1/hr/employee-profiles/${profileId}/archive`).set(authed(token)).send({ reason: '个人原因', terminationDate: '2026-10-01', ...body, version: (await cur()).version });
    await archive(staffToken).then((r) => status(r, 403)); // 普通员工没有归档权限
    const archived = (await archive(managerToken).then((r) => status(r, 201))).body as Json;
    expect(archived).toMatchObject({ status: 'TERMINATED', employeeNo: 'IMP-012', activeEmployeeNo: null, terminationReason: '个人原因' });
    expect(archived.archivedAt).toBeTruthy();
    await login('19900000011', 'banyuexuan').expect(401); // 账号已停用
    expect((await prisma.account.findUnique({ where: { id: accountId } }))!.status).toBe('DISABLED');
    await request(server).patch(`/api/v1/hr/employee-profiles/${profileId}`).set(authed(adminToken)).send({ address: 'x', version: archived.version }).expect(400); // 归档后只读
    await archive(adminToken).then((r) => status(r, 400)); // 不能重复归档

    // 列表默认不含已归档；单看归档 / 看全部
    const def = (await request(server).get('/api/v1/hr/employee-profiles').query({ keyword: '导入测试壬' }).set(authed(adminToken)).expect(200)).body as Json[];
    expect(def).toHaveLength(0);
    expect(((await request(server).get('/api/v1/hr/employee-profiles').query({ keyword: '导入测试壬', archived: 'only' }).set(authed(adminToken)).expect(200)).body as Json[])).toHaveLength(1);

    // 工号 IMP-012 已释放：新员工可以直接用；手机号仍不能重复
    await request(server).post('/api/v1/platform/accounts').set(authed(adminToken)).send({ username: '19900000012', realName: '导入测试癸', password: 'banyuexuan', phone: '19900000012', employeeNo: 'IMP-012', hireDate: '2026-10-02', storeId }).expect(201);
    await request(server).post('/api/v1/platform/accounts').set(authed(adminToken)).send({ username: 'again_x', realName: '重开', password: 'banyuexuan', phone: '19900000011', storeId }).expect(409);
  });

  it('6. 恢复在职（仅管理员）：原工号已被新员工用了就必须换新工号；恢复后账号启用、档案可改', async () => {
    const cur = async () => (await request(server).get(`/api/v1/hr/employee-profiles/${profileId}`).set(authed(adminToken)).expect(200)).body as Json;
    const restore = async (token: string, body: Json = {}) => request(server).post(`/api/v1/hr/employee-profiles/${profileId}/restore`).set(authed(token)).send({ ...body, version: (await cur()).version });
    await restore(managerToken).then((r) => status(r, 403)); // 店长不能恢复
    const clash = await restore(adminToken).then((r) => status(r, 409)); // IMP-012 已经是新员工的
    expect(clash.body.message).toContain('导入测试癸');
    const back = (await restore(adminToken, { employeeNo: 'IMP-013' }).then((r) => status(r, 201))).body as Json;
    expect(back).toMatchObject({ status: 'ACTIVE', employeeNo: 'IMP-013', activeEmployeeNo: 'IMP-013', archivedAt: null });
    await login('19900000011', 'banyuexuan').expect(201);
    await request(server).patch(`/api/v1/hr/employee-profiles/${profileId}`).set(authed(adminToken)).send({ address: '恢复后可以改了', version: back.version }).expect(200);
  });
  it('7. 用户名或手机号都能登录：用户名和手机号不同的账号，用手机号（带空格/横线/+86）也能登录；错误密码和停用账号仍被拒绝', async () => {
    const acc = (await request(server).post('/api/v1/platform/accounts').set(authed(adminToken)).send({ username: 'loginbyphone_x', realName: '手机号登录测试', password: 'banyuexuan', phone: '19900000020', storeId }).expect(201)).body as Json;
    for (const key of ['loginbyphone_x', '19900000020', '199-0000-0020', ' 199 0000 0020 ', '+8619900000020']) {
      const res = (await login(key, 'banyuexuan').expect(201)).body as Json;
      expect(res.account.id).toBe(acc.id);
    }
    // 手机/微信内置浏览器的 User-Agent 很长（超过 191 字符）也必须能正常登录，不能报服务器内部错误
    const longUa = 'Mozilla/5.0 (Linux; Android 13; PHONE) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 XWEB/1160065 MMWEBSDK/20231201 MMWEBID/1234 MicroMessenger/8.0.47.2560(0x28002F35) WeChat/arm64 Weixin NetType/WIFI Language/zh_CN ABI/arm64 ' + 'x'.repeat(200);
    expect(longUa.length).toBeGreaterThan(300);
    await request(server).post('/api/v1/auth/login').set('User-Agent', longUa).send({ username: '19900000020', password: 'banyuexuan' }).expect(201);
    await login('19900000020', 'wrong-pass').expect(401);
    await login('19900000099', 'banyuexuan').expect(401); // 不存在的手机号
    await prisma.account.update({ where: { id: acc.id }, data: { status: 'DISABLED' } });
    await login('19900000020', 'banyuexuan').expect(401);
  });

  it('8. 已有账号按表里的工号改号（含互换）；门店有工号规则时必须按前缀；新建预填也按前缀', async () => {
    const base = (name: string, phone: string, employeeNo: string) => ({ rowNo: 1, employeeNo, name, phone, storeName: null, teamName: null, departmentName: null, positionName: null, hireDate: '2026-01-01', contractType: null, socialInsurance: null, idCardNo: null, bankAccountNo: null, bankName: null, remark: null });
    const commit = (rows: Json[], token = adminToken) => request(server).post('/api/v1/platform/accounts/import/commit').set(authed(token)).send({ rows, storeId, createMissing: true, importProfileDetails: false });
    const noOf = async (phone: string) => (await prisma.employeeProfile.findFirstOrThrow({ where: { account: { phone } } })).activeEmployeeNo;
    const a = await noOf('19900000001');
    const b = await noOf('19900000002');

    // 店长没有“修改工号”权限：改不了
    const denied = (await commit([base('导入测试甲', '19900000001', 'IMP-801')], managerToken).expect(201)).body as Json;
    expect(denied.renumbered).toBe(0);
    expect(denied.failed[0].error).toContain('权限');
    expect(await noOf('19900000001')).toBe(a);

    // 管理员：改号 + 两人互换
    const r1 = (await commit([base('导入测试甲', '19900000001', 'IMP-801')]).expect(201)).body as Json;
    expect(r1).toMatchObject({ created: 0, renumbered: 1 });
    expect(await noOf('19900000001')).toBe('IMP-801');
    const swap = (await commit([{ ...base('导入测试甲', '19900000001', b!), rowNo: 1 }, { ...base('导入测试乙', '19900000002', 'IMP-801'), rowNo: 2 }]).expect(201)).body as Json;
    expect(swap.renumbered).toBe(2);
    expect(await noOf('19900000001')).toBe(b);
    expect(await noOf('19900000002')).toBe('IMP-801');
    // 撞到表外别人的工号：拒绝
    const other = await prisma.employeeProfile.findFirstOrThrow({ where: { activeEmployeeNo: { not: null }, account: { phone: { notIn: ['19900000001', '19900000002'] } } } });
    const clash = (await commit([base('导入测试甲', '19900000001', other.activeEmployeeNo!)]).expect(201)).body as Json;
    expect(clash.renumbered).toBe(0);
    expect(clash.failed[0].error).toContain('已经分配给');
    // 还原
    await commit([{ ...base('导入测试甲', '19900000001', a!), rowNo: 1 }, { ...base('导入测试乙', '19900000002', b!), rowNo: 2 }]).expect(201);
    expect(await noOf('19900000001')).toBe(a);
    expect(await noOf('19900000002')).toBe(b);

    // 门店工号规则：该门店工号必须以前缀开头
    await prisma.store.update({ where: { id: storeId }, data: { employeeNoPrefix: '7' } });
    try {
      const bad = (await commit([base('导入测试前缀', '19900000031', '8001')]).expect(201)).body as Json;
      expect(bad.created).toBe(0);
      expect(bad.failed[0].error).toContain('必须以 7 开头');
      const next = (await request(server).get('/api/v1/hr/employee-profiles/next-no').query({ storeId }).set(authed(adminToken)).expect(200)).body as Json;
      expect(next.employeeNo).toBe('701');
      const okRes = (await commit([base('导入测试前缀', '19900000031', '701')]).expect(201)).body as Json;
      expect(okRes.created).toBe(1);
      const next2 = (await request(server).get('/api/v1/hr/employee-profiles/next-no').query({ storeId }).set(authed(adminToken)).expect(200)).body as Json;
      expect(next2.employeeNo).toBe('702');
      await request(server).post('/api/v1/platform/accounts').set(authed(adminToken)).send({ username: 'prefix_x', realName: '前缀', password: 'banyuexuan', phone: '19900000032', storeId, employeeNo: '9001', hireDate: '2026-01-01' }).expect(400);
    } finally {
      await prisma.store.update({ where: { id: storeId }, data: { employeeNoPrefix: null } });
    }
  });
});
