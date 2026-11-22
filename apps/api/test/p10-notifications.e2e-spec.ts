import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  NotificationSchedulerService,
  beijingClock,
} from '../src/notification/notification-scheduler.service';
import { NotificationService } from '../src/notification/notification.service';

type Json = Record<string, any>;

/** 站内消息 / 消息中心：审批流转、催办、抄送、个人提醒到点、护理定时扫描、只能看自己的消息。 */
describe('P10 站内消息 / 消息中心 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let prisma: PrismaService;
  let scheduler: NotificationSchedulerService;
  let notifications: NotificationService;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const PASSWORD = 'Passw0rd!23';
  const tag = Date.now().toString().slice(-6);
  const authed = (u: string) => ({ Authorization: `Bearer ${tokens[u]}` });
  const get = (u: string, url: string) =>
    request(server).get(`/api/v1${url}`).set(authed(u));
  const post = (u: string, url: string, body: Json = {}) =>
    request(server).post(`/api/v1${url}`).set(authed(u)).send(body);
  const listOf = async (u: string, q = '') =>
    ((await get(u, `/notifications${q}`).expect(200)).body as Json)
      .items as Json[];

  beforeAll(async () => {
    const m: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = m.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    scheduler = app.get(NotificationSchedulerService);
    notifications = app.get(NotificationService);
    for (const u of ['admin', 'store_manager', 'store_staff']) {
      const r = (
        await request(server)
          .post('/api/v1/auth/login')
          .send({ username: u, password: PASSWORD })
          .expect(201)
      ).body as Json;
      tokens[u] = r.accessToken;
      ids[u] = r.account.id;
    }
  });
  afterAll(async () => app.close());

  it('北京时间换算与容器时区无关', () => {
    expect(beijingClock(new Date('2030-01-06T16:30:00Z'))).toEqual({
      date: '2030-01-07',
      hhmm: '00:30',
    });
  });

  it('审批：提交 → 审批人收到“待你审批”；催办 → 收到催办；通过 → 发起人收到结果', async () => {
    const title = `消息测试${tag}`;
    const demo = (
      await post('store_staff', '/demo-approvals', {
        title,
        content: 'x',
      }).expect(201)
    ).body as Json;
    const inst = (
      await post('store_staff', `/demo-approvals/${demo.id}/submit`).expect(201)
    ).body as Json;

    const mgr = await listOf('store_manager', '?category=APPROVAL');
    const mine = mgr.find((n) => n.title.includes(title));
    expect(mine).toMatchObject({
      category: 'APPROVAL',
      link: `/workflow/instances/${inst.id}`,
      readAt: null,
    });

    await post('store_staff', `/workflow/instances/${inst.id}/urge`, {
      comment: '急用',
    }).expect(201);
    expect(
      (await listOf('store_manager', '?category=URGE')).some(
        (n) => n.title.includes(title) && n.body.includes('急用'),
      ),
    ).toBe(true);

    // 逐级审批直到结束（种子里示例审批单是店长 → 平台管理员两级）
    await post('store_manager', `/workflow/instances/${inst.id}/approve`, {
      comment: 'ok',
    }).expect(201);
    let status = (await prisma.workflowInstance.findUnique({
      where: { id: inst.id },
    }))!.status;
    if (status === 'IN_REVIEW') {
      expect(
        (await listOf('admin', '?category=APPROVAL')).some((n) =>
          n.title.includes(title),
        ),
      ).toBe(true);
      await post('admin', `/workflow/instances/${inst.id}/approve`, {
        comment: 'ok',
      }).expect(201);
      status = (await prisma.workflowInstance.findUnique({
        where: { id: inst.id },
      }))!.status;
    }
    expect(status).toBe('APPROVED');
    const result = (
      await listOf('store_staff', '?category=APPROVAL_RESULT')
    ).find((n) => n.title.includes(title));
    expect(result).toMatchObject({ level: 'success' });
    expect(result!.title.startsWith('已通过')).toBe(true);
  });

  it('驳回：发起人收到带驳回意见的消息', async () => {
    const title = `驳回消息${tag}`;
    const demo = (
      await post('store_staff', '/demo-approvals', {
        title,
        content: 'x',
      }).expect(201)
    ).body as Json;
    const inst = (
      await post('store_staff', `/demo-approvals/${demo.id}/submit`).expect(201)
    ).body as Json;
    await post('store_manager', `/workflow/instances/${inst.id}/reject`, {
      comment: '金额不对',
    }).expect(201);
    const n = (await listOf('store_staff', '?category=APPROVAL_RESULT')).find(
      (x) => x.title.includes(title),
    );
    expect(n).toMatchObject({ level: 'danger' });
    expect(n!.body).toContain('金额不对');
  });

  it('客户抄送人：新建时收到；修改时只有新加的人收到', async () => {
    const phone = `139${tag}${String(Math.floor(Math.random() * 90) + 10)}`;
    const c = (
      await post('admin', '/crm/customers', {
        name: `抄送客户${tag}`,
        phone,
        source: 'WALK_IN',
        ccAccountIds: [ids.store_manager],
      }).expect(201)
    ).body as Json;
    const got = (await listOf('store_manager', '?category=CC')).filter(
      (n) => n.link === `/crm/customers/${c.id}`,
    );
    expect(got).toHaveLength(1);
    await request(server)
      .patch(`/api/v1/crm/customers/${c.id}`)
      .set(authed('admin'))
      .send({
        version: c.version,
        ccAccountIds: [ids.store_manager, ids.store_staff],
      })
      .expect(200);
    expect(
      (await listOf('store_manager', '?category=CC')).filter(
        (n) => n.link === `/crm/customers/${c.id}`,
      ),
    ).toHaveLength(1);
    expect(
      (await listOf('store_staff', '?category=CC')).filter(
        (n) => n.link === `/crm/customers/${c.id}`,
      ),
    ).toHaveLength(1);
  });

  it('个人提醒到点推送：到点发一次、不重复、超过 1 小时不补、已完成不发', async () => {
    const date = '2030-01-07';
    const tenantId = (await prisma.account.findUnique({
      where: { id: ids.store_staff },
    }))!.tenantId;
    const mk = (title: string, timeOfDay: string | null) =>
      prisma.personalReminder.create({
        data: {
          tenantId,
          accountId: ids.store_staff,
          title,
          startDate: date,
          timeOfDay,
          repeat: 'NONE',
        },
      });
    const onTime = await mk(`到点提醒${tag}`, '10:00');
    const late = await mk(`很早的提醒${tag}`, '08:30');
    const done = await mk(`已完成提醒${tag}`, '10:00');
    await prisma.personalReminderDone.create({
      data: { reminderId: done.id, date },
    });

    const at1005 = new Date('2030-01-07T02:05:00Z'); // 北京 10:05
    await scheduler.runReminders(at1005);
    await scheduler.runReminders(at1005);
    const items = await listOf('store_staff', '?category=REMINDER');
    expect(
      items.filter((n) => n.title.includes(`到点提醒${tag}`)),
    ).toHaveLength(1);
    expect(items.some((n) => n.title.includes(`很早的提醒${tag}`))).toBe(false);
    expect(items.some((n) => n.title.includes(`已完成提醒${tag}`))).toBe(false);

    // 前端轮询：since 之后新到的消息会带在 fresh 里
    const before = new Date(Date.now() - 60_000).toISOString();
    const s = (
      await get(
        'store_staff',
        `/notifications/summary?since=${encodeURIComponent(before)}`,
      ).expect(200)
    ).body as Json;
    expect(s.unread).toBeGreaterThan(0);
    expect(s.fresh.some((n: Json) => n.title.includes(`到点提醒${tag}`))).toBe(
      true,
    );
    await prisma.personalReminder.deleteMany({
      where: { id: { in: [onTime.id, late.id, done.id] } },
    });
  });

  it('护理定时扫描：没到时间不发；到时间跑不报错；护理长按门店找人', async () => {
    expect(await scheduler.runCarePlan(new Date('2030-01-06T23:00:00Z'))).toBe(
      0,
    ); // 北京 07:00
    expect(await scheduler.runCareDaily(new Date('2030-01-07T06:00:00Z'))).toBe(
      0,
    ); // 北京 14:00
    await expect(
      scheduler.runCarePlan(new Date('2030-01-07T02:00:00Z')),
    ).resolves.toBeGreaterThanOrEqual(0);
    await expect(
      scheduler.runCareDaily(new Date('2030-01-07T09:00:00Z')),
    ).resolves.toBeGreaterThanOrEqual(0);
    const mgr = await prisma.account.findUnique({
      where: { id: ids.store_manager },
    });
    if (mgr?.storeId) {
      const heads = await notifications.accountsWithPermissionInStore(
        mgr.tenantId,
        'care.profile.approve',
        mgr.storeId,
      );
      expect(heads).toContain(ids.store_manager);
      expect(heads).not.toContain(ids.store_staff);
    }
  });

  it('只能看/改自己的消息；标为已读与全部已读', async () => {
    const staffMsg = (await listOf('store_staff'))[0];
    await post('store_manager', `/notifications/${staffMsg.id}/read`).expect(
      404,
    );
    const r = (
      await post('store_staff', `/notifications/${staffMsg.id}/read`).expect(
        201,
      )
    ).body as Json;
    expect(r.readAt).toBeTruthy();
    await post('store_staff', '/notifications/read-all').expect(201);
    expect(
      (
        (await get('store_staff', '/notifications/summary').expect(200))
          .body as Json
      ).unread,
    ).toBe(0);
    expect(await listOf('store_staff', '?unread=1')).toHaveLength(0);
  });

  it('清理 90 天前的旧消息', async () => {
    const tenantId = (await prisma.account.findUnique({
      where: { id: ids.store_staff },
    }))!.tenantId;
    const old = await prisma.notification.create({
      data: {
        tenantId,
        accountId: ids.store_staff,
        category: 'SYSTEM',
        title: '旧消息',
        createdAt: new Date(Date.now() - 91 * 86400_000),
      },
    });
    expect(await notifications.purgeOld()).toBeGreaterThanOrEqual(1);
    expect(
      await prisma.notification.findUnique({ where: { id: old.id } }),
    ).toBeNull();
  });
});
