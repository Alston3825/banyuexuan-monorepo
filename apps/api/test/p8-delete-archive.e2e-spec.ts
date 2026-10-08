import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 删除/归档规则：录错的能删（空壳直接删；有录入资料要管理员+输名字），用过的（合同/入住/收款/护理痕迹）不能删只能归档，归档可恢复。 */
describe('P8 客户/母婴档案 删除与归档 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let prisma: PrismaService;
  let adminToken: string;
  let managerToken: string;
  const tag = Date.now().toString().slice(-7);
  const authed = (t: string) => ({ Authorization: `Bearer ${t}` });
  let seq = 0;
  const newCustomer = async (name: string) =>
    ((await request(server).post('/api/v1/crm/customers').set(authed(adminToken)).send({ name, phone: `137${tag}${seq++}`.slice(0, 11), source: 'ONLINE_AD' }).expect(201)).body as Json);
  const newMother = async (customerId: string, babies: Json[] = []) =>
    ((await request(server).post('/api/v1/care/mother-profiles').set(authed(adminToken)).send({ customerId, deliveryMethod: 'CESAREAN', babies }).expect(201)).body as Json);
  const del = (t: string, id: string, q = '') => request(server).delete(`/api/v1/crm/customers/${id}${q}`).set(authed(t));
  const customerExists = async (id: string) => !!(await prisma.customer.findUnique({ where: { id } }));

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. 空壳客户：店长没有“删除客户”权限（403），超级管理员直接删除', async () => {
    const c = await newCustomer(`删除测试-空壳${tag}`);
    const check = (await request(server).get(`/api/v1/crm/customers/${c.id}/delete-check`).set(authed(adminToken)).expect(200)).body as Json;
    expect(check.blockers).toEqual([]);
    expect(check.attached).toEqual([]);
    await del(managerToken, c.id).expect(403);
    await del(adminToken, c.id).expect(204);
    expect(await customerExists(c.id)).toBe(false);
  });

  it('2. 只有母婴档案/宝宝：要输入客户姓名确认，写错/不写都拒绝，写对后连同档案宝宝一起删除', async () => {
    const c = await newCustomer(`删除测试-有档案${tag}`);
    const m = await newMother(c.id, [{ name: '宝宝甲', gender: 'MALE' }]);
    const check = (await request(server).get(`/api/v1/crm/customers/${c.id}/delete-check`).set(authed(adminToken)).expect(200)).body as Json;
    expect(check.attached.join()).toContain('母婴档案');
    expect(check.attached.join()).toContain('宝宝档案');
    await del(adminToken, c.id).expect(400);
    await del(adminToken, c.id, `?confirmName=${encodeURIComponent('别人')}`).expect(400);
    expect(await customerExists(c.id)).toBe(true);
    await del(adminToken, c.id, `?confirmName=${encodeURIComponent(`删除测试-有档案${tag}`)}`).expect(204);
    expect(await customerExists(c.id)).toBe(false);
    expect(await prisma.motherProfile.count({ where: { id: m.id } })).toBe(0);
    expect(await prisma.babyProfile.count({ where: { motherProfileId: m.id } })).toBe(0);
  });

  it('3. 有护理痕迹（日常护理记录）：不能删（任何人），只能归档；归档后默认列表隐藏、不能再建档/预订，可恢复', async () => {
    const c = await newCustomer(`删除测试-已用过${tag}`);
    const m = await newMother(c.id);
    const mp = await prisma.motherProfile.findUniqueOrThrow({ where: { id: m.id } });
    await prisma.careDailyRecord.create({ data: { tenantId: mp.tenantId, storeId: mp.storeId, motherProfileId: m.id, recordDate: new Date('2026-10-01'), createdBy: 'E2E' } });

    const check = (await request(server).get(`/api/v1/crm/customers/${c.id}/delete-check`).set(authed(adminToken)).expect(200)).body as Json;
    expect(check.blockers.join()).toContain('日常护理记录');
    const refuse = await del(adminToken, c.id, `?confirmName=${encodeURIComponent(`删除测试-已用过${tag}`)}`).expect(409);
    expect(refuse.body.message).toContain('归档');
    await request(server).delete(`/api/v1/care/mother-profiles/${m.id}`).set(authed(adminToken)).expect(409);

    // 店长可以归档；归档后客户和他的母婴档案都从默认列表消失
    await request(server).post(`/api/v1/crm/customers/${c.id}/archive`).set(authed(managerToken)).send({ reason: '测试归档' }).expect(204);
    await request(server).post(`/api/v1/crm/customers/${c.id}/archive`).set(authed(managerToken)).send({}).expect(409);
    const visible = (await request(server).get('/api/v1/crm/customers').query({ keyword: `删除测试-已用过${tag}` }).set(authed(adminToken)).expect(200)).body as Json[];
    expect(visible).toHaveLength(0);
    const onlyArchived = (await request(server).get('/api/v1/crm/customers').query({ keyword: `删除测试-已用过${tag}`, archived: 'only' }).set(authed(adminToken)).expect(200)).body as Json[];
    expect(onlyArchived).toHaveLength(1);
    const mothers = (await request(server).get('/api/v1/care/mother-profiles').query({ customerId: c.id }).set(authed(adminToken)).expect(200)).body as Json[];
    expect(mothers).toHaveLength(0);
    const err = await request(server).post('/api/v1/care/mother-profiles').set(authed(adminToken)).send({ customerId: c.id }).expect(409);
    expect(err.body.message).toContain('已归档');

    await request(server).post(`/api/v1/crm/customers/${c.id}/restore`).set(authed(managerToken)).expect(204);
    expect(((await request(server).get('/api/v1/crm/customers').query({ keyword: `删除测试-已用过${tag}` }).set(authed(adminToken)).expect(200)).body as Json[])).toHaveLength(1);
    expect(((await request(server).get('/api/v1/care/mother-profiles').query({ customerId: c.id }).set(authed(adminToken)).expect(200)).body as Json[])).toHaveLength(1);
  });

  it('4. 母婴档案：空档案有更新权限即可直接删；挂着宝宝的要管理员+客户姓名确认；单独归档/恢复', async () => {
    const c = await newCustomer(`删除测试-档案页${tag}`);
    const empty = await newMother(c.id);
    const check = (await request(server).get(`/api/v1/care/mother-profiles/${empty.id}/delete-check`).set(authed(managerToken)).expect(200)).body as Json;
    expect(check).toMatchObject({ blockers: [], attached: [], customerName: `删除测试-档案页${tag}` });
    await request(server).delete(`/api/v1/care/mother-profiles/${empty.id}`).set(authed(managerToken)).expect(204);

    const withBaby = await newMother(c.id, [{ name: '宝宝乙', gender: 'FEMALE' }]);
    await request(server).delete(`/api/v1/care/mother-profiles/${withBaby.id}`).set(authed(managerToken)).expect(409); // 需要 force
    await request(server).delete(`/api/v1/care/mother-profiles/${withBaby.id}?force=true`).set(authed(managerToken)).expect((r) => { if (r.status !== 403) throw new Error(`状态 ${r.status} ${JSON.stringify(r.body)}`); }); // 店长没有强制删除权限
    await request(server).delete(`/api/v1/care/mother-profiles/${withBaby.id}?force=true`).set(authed(adminToken)).expect(400); // 没输名字
    await request(server).post(`/api/v1/care/mother-profiles/${withBaby.id}/archive`).set(authed(managerToken)).expect(204);
    expect(((await request(server).get('/api/v1/care/mother-profiles').query({ customerId: c.id }).set(authed(adminToken)).expect(200)).body as Json[])).toHaveLength(0);
    expect(((await request(server).get('/api/v1/care/mother-profiles').query({ customerId: c.id, archived: 'only' }).set(authed(adminToken)).expect(200)).body as Json[])).toHaveLength(1);
    await request(server).post(`/api/v1/care/mother-profiles/${withBaby.id}/restore`).set(authed(managerToken)).expect(204);
    await request(server).delete(`/api/v1/care/mother-profiles/${withBaby.id}?force=true&confirmName=${encodeURIComponent(`删除测试-档案页${tag}`)}`).set(authed(adminToken)).expect(204);
    expect(await prisma.babyProfile.count({ where: { motherProfileId: withBaby.id } })).toBe(0);
    await del(adminToken, c.id).expect(204);
  });

  it('5. 有合同/入住/收款等财务痕迹的客户不能删（即使是管理员），归档客户不能新建预订', async () => {
    const c = await newCustomer(`删除测试-有预订${tag}`);
    const store = await prisma.store.findFirstOrThrow({ where: {} });
    const room = await prisma.room.findFirstOrThrow({ where: { storeId: store.id } });
    const occ = await request(server)
      .post('/api/v1/room/occupancies')
      .set(authed(adminToken))
      .send({ customerId: c.id, roomId: room.id, plannedCheckIn: '2031-01-01', plannedCheckOut: '2031-01-29', storeId: store.id })
      .expect(201);
    const check = (await request(server).get(`/api/v1/crm/customers/${c.id}/delete-check`).set(authed(adminToken)).expect(200)).body as Json;
    expect(check.blockers.join()).toContain('预订/入住记录');
    await del(adminToken, c.id).expect(409);

    await request(server).post(`/api/v1/crm/customers/${c.id}/archive`).set(authed(adminToken)).send({}).expect(204);
    const again = await request(server)
      .post('/api/v1/room/occupancies')
      .set(authed(adminToken))
      .send({ customerId: c.id, roomId: room.id, plannedCheckIn: '2032-01-01', plannedCheckOut: '2032-01-29', storeId: store.id });
    expect(again.status).toBe(409);
    expect(again.body.message).toContain('已归档');
    await prisma.roomOccupancy.deleteMany({ where: { id: occ.body.id } });
  });
});
