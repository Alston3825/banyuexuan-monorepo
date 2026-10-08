import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * 预订冲突：预订阶段同一间房日期允许重叠（只提示、进待协调清单），可一键换空房/改日期；
 * 只有办理入住时房间里还住着别人才硬拦；房间之间留 1 天整理时间。
 */
describe('P8 预订冲突：允许重叠预订、冲突清单、换房、入住硬拦 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  const tag = Date.now().toString().slice(-6);
  let adminToken: string;
  let storeId: string;
  let roomTypeId: string;
  let r1: Json; // 主角房
  let r2: Json; // 同房型空房
  let r3: Json; // 不同房型空房
  let custA: string;
  let custB: string;
  let custC: string;

  const authed = (t: string) => ({ Authorization: `Bearer ${t}` });
  const get = (url: string) => request(server).get(`/api/v1${url}`).set(authed(adminToken));
  const post = (url: string, body: Json = {}) => request(server).post(`/api/v1${url}`).set(authed(adminToken)).send(body);
  const day = (offset: number) => new Date(Date.UTC(2031, 0, 1 + offset)).toISOString();
  const book = (roomId: string, customerId: string, from: number, to: number) => post('/room/occupancies', { roomId, storeId, customerId, plannedCheckIn: day(from), plannedCheckOut: day(to) });
  const conflictsOf = async (roomId: string) => ((await get(`/room/occupancies/conflicts`).expect(200)).body as Json[]).filter((c) => c.roomId === roomId);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    adminToken = ((await request(server).post('/api/v1/auth/login').send({ username: 'admin', password: 'Passw0rd!23' }).expect(201)).body as Json).accessToken;
    storeId = ((await get('/platform/stores').expect(200)).body as Json[]).find((s) => s.name.includes('示例店'))!.id;
    const types = (await get('/room/types').expect(200)).body as Json[];
    roomTypeId = types[0].id;
    const mk = async (no: string, typeId: string) => (await post('/room/rooms', { storeId, roomTypeId: typeId, roomNo: `${no}-${tag}`, floor: '8F' }).expect(201)).body as Json;
    r1 = await mk('C1', roomTypeId);
    r2 = await mk('C2', roomTypeId);
    const otherType = types.find((t) => t.id !== roomTypeId) ?? (await post('/room/types', { name: `冲突测试房型${tag}`, code: `CT${tag}`, basePrice: 100000 }).catch(() => ({ body: types[0] }))).body;
    r3 = await mk('C3', otherType.id);
    const cust = async (n: string, i: number) => (await post('/crm/customers', { name: `冲突测试${n}${tag}`, phone: `1380${tag}${i}`.slice(0, 11), source: 'ONLINE_AD' }).expect(201)).body.id as string;
    custA = await cust('甲', 1);
    custB = await cust('乙', 2);
    custC = await cust('丙', 3);
  });

  afterAll(async () => {
    await app.close();
  });

  let occA: Json;
  let occB: Json;

  it('1. 同一间房日期重叠的两个预订都能保存（不再拒绝），返回里带冲突提示', async () => {
    const a = await book(r1.id, custA, 10, 40).expect(201);
    occA = a.body;
    expect(occA.conflicts).toHaveLength(0);
    const b = await book(r1.id, custB, 24, 60).expect(201); // 重叠 16 天
    occB = b.body;
    expect(occB.conflicts).toHaveLength(1);
    expect(occB.conflicts[0]).toMatchObject({ id: occA.id, customerName: `冲突测试甲${tag}` });
  });

  it('2. 冲突清单：列出这对冲突（房号、两位客户、重叠天数、建议先调整谁）', async () => {
    const list = await conflictsOf(r1.id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ roomNo: `C1-${tag}`, overlapDays: 16, bufferOnly: false });
    expect([list[0].a.id, list[0].b.id].sort()).toEqual([occA.id, occB.id].sort());
    expect(list[0].suggestId).toBe(occB.id); // 都没合同，建议调整后预订的
  });

  it('3. 整理间隔：上一位 40 号离店，下一位 40 号当天入住算冲突（间隔不足），隔 1 天（41 号）就不冲突', async () => {
    const tight = await book(r2.id, custA, 0, 20).expect(201);
    const touching = await book(r2.id, custB, 20, 50).expect(201); // 离店当天就入住
    expect(touching.body.conflicts).toHaveLength(1);
    const c = (await conflictsOf(r2.id))[0];
    expect(c).toMatchObject({ overlapDays: 0, bufferOnly: true });
    await post(`/room/occupancies/${touching.body.id}/cancel`, { cancelReason: '测试', version: touching.body.version }).expect(201);
    const ok = await book(r2.id, custB, 21, 50).expect(201); // 隔 1 天
    expect(ok.body.conflicts).toHaveLength(0);
    expect(await conflictsOf(r2.id)).toHaveLength(0);
    // 清理占房，留出 r2 做换房目标
    await post(`/room/occupancies/${ok.body.id}/cancel`, { cancelReason: '测试', version: ok.body.version }).expect(201);
    await post(`/room/occupancies/${tight.body.id}/cancel`, { cancelReason: '测试', version: tight.body.version }).expect(201);
  });

  it('4. 一键换房：空房列表同房型排前面；换进已有预订的房被拒；换房后冲突消失', async () => {
    const free = (await get(`/room/occupancies/${occB.id}/free-rooms`).expect(200)).body as Json[];
    const ids = free.map((f) => f.id);
    expect(ids).toContain(r2.id);
    expect(ids).toContain(r3.id);
    expect(ids).not.toContain(r1.id);
    expect(free.findIndex((f) => f.id === r2.id)).toBeLessThan(free.findIndex((f) => f.id === r3.id)); // 同房型在前
    expect(free.find((f) => f.id === r2.id)!.sameType).toBe(true);

    // 把丙订到 r2（和 B 的日期有交集），B 再换去 r2 就应被拒绝
    const c = await book(r2.id, custC, 30, 70).expect(201);
    await post(`/room/occupancies/${occB.id}/change-room`, { roomId: r2.id, version: occB.version }).expect(409);
    await post(`/room/occupancies/${c.body.id}/cancel`, { cancelReason: '测试', version: c.body.version }).expect(201);

    const moved = (await post(`/room/occupancies/${occB.id}/change-room`, { roomId: r2.id, version: occB.version }).expect(201)).body as Json;
    expect(moved.roomId).toBe(r2.id);
    expect(await conflictsOf(r1.id)).toHaveLength(0);
  });

  it('5. 优先级：已有合同的预订优先保留，建议调整只有意向的那位', async () => {
    const x = (await book(r3.id, custA, 100, 130).expect(201)).body as Json;
    const y = (await book(r3.id, custB, 110, 140).expect(201)).body as Json;
    const list = await conflictsOf(r3.id);
    expect(list).toHaveLength(1);
    expect(list[0].suggestId).toBe(y.id); // 同为意向 → 后预订的
    expect([x.id, y.id]).toContain(list[0].suggestId);
    expect(list[0].a.priority).toBe('INTENT');
  });

  it('6. 办理入住：房间里现在还住着别人就拦住；上一位离店后才能入住；待办里有冲突提醒', async () => {
    // r1：A 先入住（计划 10~40 号）；再订一个紧接着的丁，提前办入住应被拦
    const aNow = (await get(`/room/occupancies/${occA.id}`).expect(200)).body as Json;
    const aIn = (await post(`/room/occupancies/${occA.id}/check-in`, { version: aNow.version }).expect(201)).body as Json;
    expect(aIn.status).toBe('CHECKED_IN');
    const d = (await book(r1.id, custC, 41, 70).expect(201)).body as Json;
    const blocked = await post(`/room/occupancies/${d.id}/check-in`, { version: d.version }).expect(409);
    expect(blocked.body.message).toContain('这间房现在还住着');
    await post(`/room/occupancies/${occA.id}/check-out`, { version: aIn.version }).expect(201);
    await post(`/room/occupancies/${d.id}/check-in`, { version: d.version }).expect(201);

    // 待办：r3 上还有未解决的冲突
    const todos = (await get('/workspace/todos').expect(200)).body as Json;
    expect(todos.items.some((i: Json) => i.kind === 'ROOM_CONFLICT')).toBe(true);
    expect(todos.byKind.ROOM_CONFLICT).toBe(1);
  });

  it('7. 改期同样允许重叠：改后返回冲突提示；已入住的不能换房', async () => {
    const z = (await book(r3.id, custC, 200, 230).expect(201)).body as Json;
    const moved = (await request(server).patch(`/api/v1/room/occupancies/${z.id}/reschedule`).set(authed(adminToken)).send({ plannedCheckIn: day(105), plannedCheckOut: day(135), version: z.version }).expect(200)).body as Json;
    expect(moved.conflicts.length).toBeGreaterThanOrEqual(1);
    const inHouse = (await get(`/room/occupancies`).query({ roomId: r1.id, status: 'CHECKED_IN' }).expect(200)).body as Json[];
    await post(`/room/occupancies/${inHouse[0].id}/change-room`, { roomId: r2.id, version: inHouse[0].version }).expect(400);
  });
});
