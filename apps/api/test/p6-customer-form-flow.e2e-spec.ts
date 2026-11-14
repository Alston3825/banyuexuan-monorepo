import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * "新建客户页面按行业系统改版"的后端：手机号查重（再次入住妈妈放行）、身份证校验+生日自动算、
 * 具体渠道资料（类型/渠道配套）、推荐人（老客户/员工，含拼音简拼搜索）、员工下拉、
 * 电话销售员/抄送人、添加时间可补录、编辑时传 null 清空。
 * 必须连独立测试库（DATABASE_URL 指向 banyuexuan_e2e / banyuexuan_test），不要连开发库。
 */
describe('P6 新建客户页面改版 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let prisma: PrismaService;

  const SEED_PASSWORD = process.env.E2E_SEED_PASSWORD ?? 'Passw0rd!23';
  const runTag = Date.now().toString().slice(-8);
  // 11 位手机号：135 + 6 位运行标记 + 2 位序号（序号补零，避免 10、11… 被截成同一个号码）
  const phone = (n: number) => `135${runTag.slice(-6)}${String(n).padStart(2, '0')}`;

  let adminToken: string;
  let staffToken: string;
  let adminId: string;
  const authed = (t: string) => ({ Authorization: `Bearer ${t}` });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Json = any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);

    const login = async (username: string) =>
      (await request(server).post('/api/v1/auth/login').send({ username, password: SEED_PASSWORD }).expect(201)).body;
    const admin = await login('admin');
    adminToken = admin.accessToken;
    adminId = admin.account.id;
    staffToken = (await login('store_staff')).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const create = (body: Json, token = adminToken) => request(server).post('/api/v1/crm/customers').set(authed(token)).send(body);

  it('1. 身份证校验接口：合法号码返回出生日期，位数不对/校验位错/日期不存在都说明原因', async () => {
    const ok = await request(server).get('/api/v1/crm/customers/id-card-check').query({ idCardNo: '11010519491231002X' }).set(authed(adminToken)).expect(200);
    expect(ok.body).toMatchObject({ valid: true, birthday: '1949-12-31', gender: 'FEMALE' });
    const male = await request(server).get('/api/v1/crm/customers/id-card-check').query({ idCardNo: '110105194912310011' }).set(authed(adminToken)).expect(200);
    expect(male.body).toMatchObject({ valid: true, gender: 'MALE' }); // 第 17 位奇数=男
    const short = await request(server).get('/api/v1/crm/customers/id-card-check').query({ idCardNo: '1101051949' }).set(authed(adminToken)).expect(200);
    expect(short.body.valid).toBe(false);
    const badSum = await request(server).get('/api/v1/crm/customers/id-card-check').query({ idCardNo: '110105194912310021' }).set(authed(adminToken)).expect(200);
    expect(badSum.body.reason).toContain('校验位');
    const badDate = await request(server).get('/api/v1/crm/customers/id-card-check').query({ idCardNo: '110105194913310028' }).set(authed(adminToken)).expect(200);
    expect(badDate.body.valid).toBe(false);
  });

  it('2. 填身份证建档：生日自动算出、号码规范化（小写x转大写）；身份证不合法直接拒绝', async () => {
    const res = await create({ name: `E2E身份证${runTag}`, phone: phone(1), source: 'WALK_IN', idCardNo: '11010519491231002x' }).expect(201);
    expect(res.body.idCardNo).toBe('11010519491231002X');
    expect(res.body.birthday.slice(0, 10)).toBe('1949-12-31');
    await create({ name: 'E2E坏身份证', phone: phone(2), source: 'WALK_IN', idCardNo: '110105194912310021' }).expect(400);
    // 手工填的生日优先于身份证推算
    const manual = await create({ name: `E2E手填生日${runTag}`, phone: phone(3), source: 'WALK_IN', idCardNo: '11010519491231002X', birthday: '1990-05-05' }).expect(201);
    expect(manual.body.birthday.slice(0, 10)).toBe('1990-05-05');
  });

  it('3. 手机号查重：已被使用时拒绝并说明是谁；勾选"再次入住妈妈允许号码重复"放行', async () => {
    const dupPhone = phone(4);
    await create({ name: `E2E一胎${runTag}`, phone: dupPhone, source: 'WALK_IN' }).expect(201);
    const rejected = await create({ name: `E2E二胎${runTag}`, phone: dupPhone, source: 'WALK_IN' }).expect(409);
    expect(rejected.body.message).toContain(`E2E一胎${runTag}`);
    expect(rejected.body.message).toContain('再次入住');
    await create({ name: `E2E二胎${runTag}`, phone: dupPhone, source: 'WALK_IN', allowDuplicatePhone: true }).expect(201);
  });

  it('4. 编辑时改手机号同样查重（排除自己），传 null 可以清空字段', async () => {
    const a = (await create({ name: `E2E编辑A${runTag}`, phone: phone(5), source: 'WALK_IN', hospital: '某医院', zone: '陆家嘴', hisNo: 'H1' }).expect(201)).body;
    const b = (await create({ name: `E2E编辑B${runTag}`, phone: phone(6), source: 'WALK_IN' }).expect(201)).body;
    await request(server).patch(`/api/v1/crm/customers/${b.id}`).set(authed(adminToken)).send({ phone: phone(5), version: b.version }).expect(409);
    // 改成自己的号码（没变）不算重复
    await request(server).patch(`/api/v1/crm/customers/${a.id}`).set(authed(adminToken)).send({ phone: phone(5), name: `E2E编辑A2${runTag}`, version: a.version }).expect(200);
    const a2 = (await request(server).get(`/api/v1/crm/customers/${a.id}`).set(authed(adminToken)).expect(200)).body;
    const cleared = await request(server)
      .patch(`/api/v1/crm/customers/${a.id}`)
      .set(authed(adminToken))
      .send({ hospital: null, zone: null, hisNo: null, version: a2.version })
      .expect(200);
    expect(cleared.body.hospital).toBeNull();
    expect(cleared.body.zone).toBeNull();
    expect(cleared.body.hisNo).toBeNull();
  });

  it('5. 渠道类型可自定义，具体渠道挂在类型下：新增/同名拒绝/停用；客户的渠道必须属于所选类型且启用', async () => {
    const api = (m: 'get' | 'post' | 'patch' | 'delete', path: string, token = adminToken) => request(server)[m](`/api/v1/crm${path}`).set(authed(token));
    const types = (await api('get', '/customer-channel-types').expect(200)).body;
    expect(types.filter((t: Json) => t.legacySource).map((t: Json) => t.legacySource).sort()).toEqual(['OTHER', 'PARTNER', 'REFERRAL', 'SOCIAL_MEDIA', 'ONLINE_AD', 'WALK_IN'].sort());
    const online = types.find((t: Json) => t.legacySource === 'ONLINE_AD');
    const social = types.find((t: Json) => t.legacySource === 'SOCIAL_MEDIA');
    const walkIn = types.find((t: Json) => t.legacySource === 'WALK_IN');

    // 自定义类型：新增、同名拒绝
    const hosp = (await api('post', '/customer-channel-types').send({ name: `医院合作${runTag}` }).expect(201)).body;
    await api('post', '/customer-channel-types').send({ name: `医院合作${runTag}` }).expect(409);
    // 内置类型可改名；改完还原
    const renamed = (await api('patch', `/customer-channel-types/${walkIn.id}`).send({ name: `到店${runTag}`, version: walkIn.version }).expect(200)).body;
    expect(renamed.name).toBe(`到店${runTag}`);
    await api('patch', `/customer-channel-types/${walkIn.id}`).send({ name: walkIn.name, version: renamed.version }).expect(200);

    // 具体渠道：同类型同名拒绝，不同类型同名允许
    const ch = (await api('post', '/customer-channels').send({ typeId: online.id, name: `小红书${runTag}` }).expect(201)).body;
    await api('post', '/customer-channels').send({ typeId: online.id, name: `小红书${runTag}` }).expect(409);
    await api('post', '/customer-channels').send({ typeId: social.id, name: `小红书${runTag}` }).expect(201);
    const hospCh = (await api('post', '/customer-channels').send({ typeId: hosp.id, name: `某妇幼${runTag}` }).expect(201)).body;

    // 用自定义类型+其下具体渠道建档：source 归并成 OTHER
    const custom = await create({ name: `E2E自定义渠道${runTag}`, phone: phone(19), channelTypeId: hosp.id, channelId: hospCh.id }).expect(201);
    expect(custom.body).toMatchObject({ channelTypeId: hosp.id, channelId: hospCh.id, source: 'OTHER' });
    // 没传类型 → 400；渠道类型和具体渠道错配 → 400
    await create({ name: 'E2E没选类型', phone: phone(20) }).expect(400);
    await create({ name: 'E2E渠道错配', phone: phone(8), channelTypeId: walkIn.id, channelId: ch.id }).expect(400);

    // 内置旧枚举写法（线索转化等内部调用）仍可用，自动对应内置类型
    const ok = await create({ name: `E2E渠道${runTag}`, phone: phone(7), source: 'ONLINE_AD', channelId: ch.id }).expect(201);
    expect(ok.body).toMatchObject({ channelId: ch.id, channelTypeId: online.id, source: 'ONLINE_AD' });

    // 只改渠道类型、不指定新渠道：旧的具体渠道自动清空
    const moved = await request(server).patch(`/api/v1/crm/customers/${ok.body.id}`).set(authed(adminToken)).send({ channelTypeId: hosp.id, version: ok.body.version }).expect(200);
    expect(moved.body).toMatchObject({ channelTypeId: hosp.id, channelId: null, source: 'OTHER' });

    // 停用后不能再选
    const stopped = (await api('patch', `/customer-channels/${ch.id}`).send({ status: 'INACTIVE', version: ch.version }).expect(200)).body;
    expect(stopped.status).toBe('INACTIVE');
    await create({ name: 'E2E停用渠道', phone: phone(9), channelTypeId: online.id, channelId: ch.id }).expect(400);
    const stoppedType = (await api('patch', `/customer-channel-types/${hosp.id}`).send({ status: 'INACTIVE', version: hosp.version }).expect(200)).body;
    await create({ name: 'E2E停用类型', phone: phone(21), channelTypeId: hosp.id }).expect(400);

    const list = (await api('get', '/customer-channels').query({ typeId: online.id }).expect(200)).body;
    expect(list.find((x: Json) => x.id === ch.id)).toMatchObject({ status: 'INACTIVE', customerCount: 0 });

    // 删除限制：内置类型不能删；被客户用过的类型/渠道不能删；没人用的渠道/类型可以删
    await api('delete', `/customer-channel-types/${walkIn.id}`).expect(409);
    await api('delete', `/customer-channel-types/${hosp.id}`).expect(409); // 下面有渠道、也有客户
    await api('delete', `/customer-channels/${hospCh.id}`).expect(409); // 客户 custom 在用
    await api('delete', `/customer-channels/${ch.id}`).expect(204); // 没有客户在用
    const spare = (await api('post', '/customer-channel-types').send({ name: `临时类型${runTag}` }).expect(201)).body;
    await api('delete', `/customer-channel-types/${spare.id}`).expect(204);
    expect(stoppedType.status).toBe('INACTIVE');
  });

  it('6. 渠道类型和具体渠道的新增/修改/删除只有超级管理员能做，店员只能查看（新建客户要选）', async () => {
    await request(server).get('/api/v1/crm/customer-channels').set(authed(staffToken)).expect(200);
    const types = (await request(server).get('/api/v1/crm/customer-channel-types').set(authed(staffToken)).expect(200)).body;
    await request(server).post('/api/v1/crm/customer-channels').set(authed(staffToken)).send({ typeId: types[0].id, name: 'E2E店员新增' }).expect(403);
    await request(server).post('/api/v1/crm/customer-channel-types').set(authed(staffToken)).send({ name: 'E2E店员新增类型' }).expect(403);
    await request(server).delete(`/api/v1/crm/customer-channel-types/${types[0].id}`).set(authed(staffToken)).expect(403);
  });

  it('7. 推荐人：老客户或员工，类型和 id 必须配套且存在；员工下拉和拼音简拼搜索不要求账号管理权限', async () => {
    const referrer = (await create({ name: `李青${runTag}`, phone: phone(10), source: 'WALK_IN' }).expect(201)).body;
    const byCustomer = await create({ name: `E2E被推荐${runTag}`, phone: phone(11), source: 'REFERRAL', referrerType: 'CUSTOMER', referrerId: referrer.id }).expect(201);
    expect(byCustomer.body).toMatchObject({ referrerType: 'CUSTOMER', referrerId: referrer.id });
    await create({ name: 'E2E员工推荐', phone: phone(12), source: 'REFERRAL', referrerType: 'ACCOUNT', referrerId: adminId }).expect(201);
    await create({ name: 'E2E推荐缺id', phone: phone(13), source: 'REFERRAL', referrerType: 'CUSTOMER' }).expect(400);
    await create({ name: 'E2E推荐不存在', phone: phone(14), source: 'REFERRAL', referrerType: 'CUSTOMER', referrerId: 'nope' }).expect(400);

    // 客户可以用姓名、手机号检索，也可以用拼音简拼（李青 -> lq）
    const byName = await request(server).get('/api/v1/crm/customers/referrer-search').query({ keyword: `李青${runTag}` }).set(authed(staffToken)).expect(200);
    expect(byName.body.customers.some((c: Json) => c.id === referrer.id)).toBe(true);
    const byInitials = await request(server).get('/api/v1/crm/customers/referrer-search').query({ keyword: 'lq' }).set(authed(staffToken)).expect(200);
    expect(byInitials.body.customers.some((c: Json) => c.id === referrer.id)).toBe(true);

    // 员工下拉：店员（没有 platform.account 权限）也拿得到
    const staff = await request(server).get('/api/v1/crm/customers/staff-options').set(authed(staffToken)).expect(200);
    expect(staff.body.some((a: Json) => a.id === adminId)).toBe(true);
    expect(staff.body[0]).not.toHaveProperty('passwordHash');
  });

  it('8. 电话销售员、抄送人、添加时间可补录：员工必须存在；不传门店销售员默认是录入人', async () => {
    const res = await create({
      name: `E2E分配${runTag}`,
      phone: phone(15),
      source: 'WALK_IN',
      phoneSalesId: adminId,
      ccAccountIds: [adminId],
      registeredAt: '2025-03-01T00:00:00.000Z',
      zone: '世博小区',
      passportNo: 'E12345678',
    }).expect(201);
    expect(res.body).toMatchObject({ phoneSalesId: adminId, ccAccountIds: [adminId], zone: '世博小区', passportNo: 'E12345678' });
    expect(res.body.assignedToId).toBe(adminId); // 没传门店销售员 -> 录入人
    expect(res.body.registeredAt.slice(0, 10)).toBe('2025-03-01');
    expect(new Date(res.body.createdAt).getFullYear()).toBeGreaterThanOrEqual(2026); // 入库时间不受补录影响
    await create({ name: 'E2E假员工', phone: phone(16), source: 'WALK_IN', phoneSalesId: 'nope' }).expect(400);
    await create({ name: 'E2E假抄送', phone: phone(17), source: 'WALK_IN', ccAccountIds: ['nope'] }).expect(400);
  });

  it('9. 手机号在客户详情/列表里不打码（业务要求），身份证号测试阶段也按普通信息展示', async () => {
    const c = (await create({ name: `E2E不打码${runTag}`, phone: phone(18), source: 'WALK_IN', idCardNo: '11010519491231002X' }).expect(201)).body;
    const detail = await request(server).get(`/api/v1/crm/customers/${c.id}`).set(authed(staffToken)).expect(200);
    expect(detail.body.phone).toBe(phone(18));
    expect(detail.body.idCardNo).toBe('11010519491231002X');
  });
});
