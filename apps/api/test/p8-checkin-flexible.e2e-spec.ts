import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 办理入住：预订只是预计，入住时可改房间/入住日期/天数；在住的房不能入，逾期未离店的勾选确认后替他办离店 */
describe('P8 灵活办理入住 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let prisma: PrismaService;
  let token: string;
  const tag = Date.now().toString().slice(-7);
  const authed = () => ({ Authorization: `Bearer ${token}` });
  const day = (n: number) => new Date(new Date().setHours(0, 0, 0, 0) + n * 86_400_000);

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

  it('换房 + 改日期/天数入住；在住的房拦截；逾期未离店需确认', async () => {
    const store = await prisma.store.findFirstOrThrow({ where: { name: { contains: '示例店' } } });
    const admin = await prisma.account.findFirstOrThrow({ where: { username: 'admin' } });
    const tpl = await prisma.room.findFirstOrThrow({ where: { storeId: store.id } });
    const rooms = await Promise.all(['A', 'B', 'C', 'D'].map((n) => prisma.room.create({ data: { tenantId: store.tenantId, storeId: store.id, roomTypeId: tpl.roomTypeId, roomNo: `CI${n}${tag}`, floor: '9', createdBy: admin.id } })));
    const [booked, other, busy, stale] = rooms;
    const mkCustomer = (n: string) => prisma.customer.create({ data: { tenantId: store.tenantId, customerNo: `CI${n}${tag}`, name: `入住客${n}${tag}`, phone: `138${tag}${n}`.slice(0, 11), primaryStoreId: store.id, createdBy: admin.id } });
    const mkOcc = (customerId: string, roomId: string, status: 'RESERVED' | 'CHECKED_IN', inDay: number, outDay: number) =>
      prisma.roomOccupancy.create({ data: { tenantId: store.tenantId, occupancyNo: `CI${tag}${Math.random().toString(36).slice(2, 6)}`, roomId, storeId: store.id, customerId, status, plannedCheckIn: day(inDay), plannedCheckOut: day(outDay), actualCheckInAt: status === 'CHECKED_IN' ? day(inDay) : null, createdBy: admin.id } });
    const guest = await mkCustomer('1');
    const resv = await mkOcc(guest.id, booked.id, 'RESERVED', 3, 31);
    const nowIn = await mkOcc((await mkCustomer('2')).id, busy.id, 'CHECKED_IN', -5, 20);
    const oldIn = await mkOcc((await mkCustomer('3')).id, stale.id, 'CHECKED_IN', -40, -2);

    const list = (await request(server).get(`/api/v1/room/occupancies/${resv.id}/checkin-rooms`).set(authed()).expect(200)).body as Json[];
    expect(list.find((r) => r.id === booked.id)).toMatchObject({ isBooked: true, state: 'FREE' });
    expect(list.find((r) => r.id === busy.id)?.state).toBe('IN_HOUSE');
    expect(list.find((r) => r.id === stale.id)?.state).toBe('OVERDUE');

    await request(server).post(`/api/v1/room/occupancies/${resv.id}/check-in`).set(authed()).send({ version: resv.version, roomId: busy.id }).expect(409); // 在住
    await request(server).post(`/api/v1/room/occupancies/${resv.id}/check-in`).set(authed()).send({ version: resv.version, roomId: stale.id }).expect(409); // 逾期但没确认
    const ok = (await request(server).post(`/api/v1/room/occupancies/${resv.id}/check-in`).set(authed()).send({ version: resv.version, roomId: stale.id, checkInDate: day(0).toISOString(), plannedCheckOut: day(26).toISOString(), releaseOverdue: true }).expect(201)).body as Json;
    expect(ok).toMatchObject({ status: 'CHECKED_IN', roomId: stale.id });
    expect(new Date(ok.plannedCheckOut).getTime()).toBe(day(26).getTime());
    expect((await prisma.roomOccupancy.findUniqueOrThrow({ where: { id: oldIn.id } })).status).toBe('CHECKED_OUT');
    expect((await prisma.roomOccupancy.findUniqueOrThrow({ where: { id: nowIn.id } })).status).toBe('CHECKED_IN');

    // 老用法（只传 version）仍可入住预订的原房间
    const g2 = await mkCustomer('4');
    const r2 = await mkOcc(g2.id, other.id, 'RESERVED', 1, 29);
    await request(server).post(`/api/v1/room/occupancies/${r2.id}/check-in`).set(authed()).send({ version: r2.version }).expect(201);
    // 离店日期不晚于入住日期 → 400
    const r3 = await mkOcc((await mkCustomer('5')).id, booked.id, 'RESERVED', 40, 60);
    await request(server).post(`/api/v1/room/occupancies/${r3.id}/check-in`).set(authed()).send({ version: r3.version, checkInDate: day(5).toISOString(), plannedCheckOut: day(5).toISOString() }).expect(400);
  });
});
