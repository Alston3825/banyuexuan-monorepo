import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 呼叫定位系统对接：API Key 拉取主数据、设备绑定、事件、呼叫写回幂等、账号校验 */
describe('P9 系统集成（呼叫定位系统） (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let prisma: PrismaService;
  let token: string;
  const tag = Date.now().toString().slice(-7);
  const authed = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    token = ((await request(server).post('/api/v1/auth/login').send({ username: 'admin', password: 'Passw0rd!23' }).expect(201)).body as Json).accessToken as string;
  });
  afterAll(async () => {
    await app.close();
  }, 60000);

  it('接入系统 → 绑定设备 → 外部拉取/事件/写回/校验', async () => {
    const store = await prisma.store.findFirstOrThrow({ where: { name: { contains: '示例店' } } });
    const admin = await prisma.account.findFirstOrThrow({ where: { username: 'admin' } });
    const tpl = await prisma.room.findFirstOrThrow({ where: { storeId: store.id } });
    const room = await prisma.room.create({ data: { tenantId: store.tenantId, storeId: store.id, roomTypeId: tpl.roomTypeId, roomNo: `IG${tag}`, floor: '8F', createdBy: admin.id } });
    const room2 = await prisma.room.create({ data: { tenantId: store.tenantId, storeId: store.id, roomTypeId: tpl.roomTypeId, roomNo: `IH${tag}`, floor: '8F', createdBy: admin.id } });

    // 没 key / 乱 key 都进不来
    await request(server).get('/api/v1/integration/v1/stores').expect(401);
    await request(server).get('/api/v1/integration/v1/stores').set({ Authorization: 'Bearer bmx_nope' }).expect(401);

    const created = (await request(server).post('/api/v1/integration/systems').set(authed()).send({ code: `call-${tag}`, name: '呼叫定位系统' }).expect(201)).body as Json;
    expect(created.apiKey).toMatch(/^bmx_/);
    const key = { Authorization: `Bearer ${created.apiKey}` };
    await request(server).post('/api/v1/integration/systems').set(authed()).send({ code: `call-${tag}`, name: 'x' }).expect(409);
    // 列表不泄露哈希/明文
    const list = (await request(server).get('/api/v1/integration/systems').set(authed()).expect(200)).body as Json[];
    expect(JSON.stringify(list)).not.toContain(created.apiKey);
    expect(list.find((s) => s.id === created.id)?.apiKeyHash).toBeUndefined();

    // 房间设备绑定：平板一间一台；同一设备号不能绑两间；信标可多个
    await request(server).post('/api/v1/integration/room-bindings').set(authed()).send({ roomId: room.id, kind: 'TABLET', deviceCode: `PAD-${tag}` }).expect(201);
    await request(server).post('/api/v1/integration/room-bindings').set(authed()).send({ roomId: room.id, kind: 'TABLET', deviceCode: `PAD2-${tag}` }).expect(409);
    await request(server).post('/api/v1/integration/room-bindings').set(authed()).send({ roomId: room2.id, kind: 'TABLET', deviceCode: `PAD-${tag}` }).expect(409);
    await request(server).post('/api/v1/integration/room-bindings').set(authed()).send({ roomId: room.id, kind: 'BEACON', deviceCode: `B1-${tag}` }).expect(201);
    await request(server).post('/api/v1/integration/room-bindings').set(authed()).send({ roomId: room.id, kind: 'BEACON', deviceCode: `B2-${tag}` }).expect(201);

    const since = new Date(Date.now() - 60_000).toISOString();
    const rooms = (await request(server).get(`/api/v1/integration/v1/rooms?storeId=${store.id}&updatedSince=${encodeURIComponent(since)}`).set(key).expect(200)).body as Json;
    const r = rooms.items.find((x: Json) => x.room_id === room.id);
    expect(r).toMatchObject({ store_id: store.id, floor: '8F', room_no: `IG${tag}`, tablet_device_id: `PAD-${tag}`, status: 'FREE' });
    expect(r.beacon_ids.sort()).toEqual([`B1-${tag}`, `B2-${tag}`]);
    expect(rooms.nextSince).toBeTruthy();

    // 员工：手表/当班/楼层
    const prof = (await prisma.employeeProfile.findFirst({ where: { accountId: admin.id } })) ?? (await prisma.employeeProfile.create({ data: { tenantId: store.tenantId, accountId: admin.id, employeeNo: `IG${tag}`, activeEmployeeNo: `IG${tag}`, hireDate: new Date(), createdBy: admin.id } }));
    await request(server).patch(`/api/v1/hr/employee-profiles/${prof.id}`).set(authed()).send({ version: prof.version, watchId: `W-${tag}`, dutyStatus: 'ON_DUTY', responsibleFloors: ['8F'] }).expect(200);
    const staff = (await request(server).get(`/api/v1/integration/v1/staff?updatedSince=${encodeURIComponent(since)}`).set(key).expect(200)).body as Json;
    expect(staff.items.find((x: Json) => x.staff_id === admin.id)).toMatchObject({ watch_id: `W-${tag}`, duty_status: 'ON_DUTY', responsible_floors: ['8F'] });

    // 入住：stay 数据 + 办理入住产生事件
    const cust = await prisma.customer.create({ data: { tenantId: store.tenantId, customerNo: `IG${tag}`, name: `集成客${tag}`, phone: `139${tag}0`.slice(0, 11), salutation: '小雨妈妈', primaryStoreId: store.id, createdBy: admin.id } });
    const occ = await prisma.roomOccupancy.create({ data: { tenantId: store.tenantId, occupancyNo: `IG${tag}`, roomId: room.id, storeId: store.id, customerId: cust.id, status: 'RESERVED', plannedCheckIn: new Date(), plannedCheckOut: new Date(Date.now() + 28 * 86_400_000), createdBy: admin.id } });
    const evBefore = (await request(server).get(`/api/v1/integration/v1/events?storeId=${store.id}`).set(key).expect(200)).body as Json;
    await request(server).post(`/api/v1/room/occupancies/${occ.id}/check-in`).set(authed()).send({ version: occ.version }).expect(201);
    const ev = (await request(server).get(`/api/v1/integration/v1/events?storeId=${store.id}&afterSeq=${evBefore.nextSeq}`).set(key).expect(200)).body as Json;
    expect(ev.items.map((e: Json) => e.type)).toContain('stay.checked_in');
    expect(ev.items[0].topic).toBe(`${store.id}/mgmt/${ev.items[0].type}`);

    const stays = (await request(server).get(`/api/v1/integration/v1/stays?storeId=${store.id}&status=CHECKED_IN&updatedSince=${encodeURIComponent(since)}`).set(key).expect(200)).body as Json;
    expect(stays.items.find((x: Json) => x.stay_id === occ.id)).toMatchObject({ room_id: room.id, customer_id: cust.id, salutation: '小雨妈妈', status: 'CHECKED_IN' });

    // 服务项字典
    const codes = (await request(server).get('/api/v1/integration/v1/service-codes').set(key).expect(200)).body as Json;
    expect(codes.items.map((c: Json) => c.service_code)).toEqual(expect.arrayContaining(['NEED_NURSE', 'EMERGENCY']));

    // 呼叫写回：幂等 + 后续更新合并，不被空值覆盖；串店引用被拒
    const callBody = { call_id: `C-${tag}`, store_id: store.id, room_id: room.id, stay_id: occ.id, request_type: 'CALL_REQUEST', service_code: 'NEED_NURSE', initiated_at: new Date().toISOString() };
    await request(server).post('/api/v1/integration/v1/call-events').set(key).send(callBody).expect(200);
    await request(server).post('/api/v1/integration/v1/call-events').set(key).send({ call_id: `C-${tag}`, store_id: store.id, status: 'COMPLETED', handler_staff_id: admin.id, accepted_at: new Date().toISOString(), completed_at: new Date().toISOString() }).expect(200);
    const rows = await prisma.externalCallRecord.findMany({ where: { callId: `C-${tag}` } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'COMPLETED', roomId: room.id, stayId: occ.id, handlerStaffId: admin.id, serviceCode: 'NEED_NURSE' });
    await request(server).post('/api/v1/integration/v1/call-events').set(key).send({ call_id: `X-${tag}`, store_id: store.id, room_id: 'not-a-room', request_type: 'CALL_REQUEST' }).expect(400);

    // 统一账号校验
    const bad = (await request(server).post('/api/v1/integration/v1/auth/verify').set(key).send({ username: 'admin', password: 'wrong' }).expect(200)).body as Json;
    expect(bad.valid).toBe(false);
    const good = (await request(server).post('/api/v1/integration/v1/auth/verify').set(key).send({ username: 'admin', password: 'Passw0rd!23' }).expect(200)).body as Json;
    expect(good).toMatchObject({ valid: true, staff_id: admin.id });
    expect(good.permissions.length).toBeGreaterThan(0);

    // 停用后立即失效；重置密钥后旧 key 失效
    const reset = (await request(server).post(`/api/v1/integration/systems/${created.id}/reset-key`).set(authed()).expect(201)).body as Json;
    await request(server).get('/api/v1/integration/v1/ping').set(key).expect(401);
    await request(server).get('/api/v1/integration/v1/ping').set({ Authorization: `Bearer ${reset.apiKey}` }).expect(200);
    await request(server).patch(`/api/v1/integration/systems/${created.id}`).set(authed()).send({ enabled: false }).expect(200);
    await request(server).get('/api/v1/integration/v1/ping').set({ Authorization: `Bearer ${reset.apiKey}` }).expect(401);
  }, 120000);
});
