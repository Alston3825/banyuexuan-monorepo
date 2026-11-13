import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { reminderDueOn } from '../src/workspace/workbench.service';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe('P9 我的待办·个人工作台 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let token: string;
  const authed = () => ({ Authorization: `Bearer ${token}` });
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  beforeAll(async () => {
    const m: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = m.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    token = ((await request(server).post('/api/v1/auth/login').send({ username: 'admin', password: 'Passw0rd!23' }).expect(201)).body as Json).accessToken as string;
  });
  afterAll(async () => app.close());

  it('重复规则：每天/工作日/每周/每月（短月取月底）', () => {
    expect(reminderDueOn({ repeat: 'DAILY', startDate: '2026-11-01', weekday: null, monthDay: null }, '2026-11-10')).toBe(true);
    expect(reminderDueOn({ repeat: 'DAILY', startDate: '2026-11-11', weekday: null, monthDay: null }, '2026-11-10')).toBe(false);
    expect(reminderDueOn({ repeat: 'WEEKDAYS', startDate: '2026-11-01', weekday: null, monthDay: null }, '2026-11-14')).toBe(false); // 周六
    expect(reminderDueOn({ repeat: 'MONTHLY', startDate: '2026-01-31', weekday: null, monthDay: 31 }, '2026-02-28')).toBe(true);
  });

  it('四象限任务：新增 → 移动 → 完成', async () => {
    const t = (await request(server).post('/api/v1/workspace/my/tasks').set(authed()).send({ title: '测试任务', quadrant: 'Q1' }).expect(201)).body as Json;
    expect(t.quadrant).toBe('Q1');
    await request(server).patch(`/api/v1/workspace/my/tasks/${t.id}`).set(authed()).send({ quadrant: 'Q3' }).expect(200);
    await request(server).patch(`/api/v1/workspace/my/tasks/${t.id}`).set(authed()).send({ quadrant: 'Q9' }).expect(400);
    await request(server).patch(`/api/v1/workspace/my/tasks/${t.id}`).set(authed()).send({ done: true }).expect(200);
    const list = (await request(server).get('/api/v1/workspace/my/tasks').set(authed()).expect(200)).body as Json[];
    expect(list.find((x) => x.id === t.id)).toMatchObject({ quadrant: 'Q3', done: true });
    await request(server).delete(`/api/v1/workspace/my/tasks/${t.id}`).set(authed()).expect(200);
  });

  it('重要提醒：当天自动出现，可完成/撤销', async () => {
    const r = (await request(server).post('/api/v1/workspace/my/reminders').set(authed()).send({ title: '测试提醒', repeat: 'DAILY', startDate: today(), timeOfDay: '09:30' }).expect(201)).body as Json;
    await request(server).post('/api/v1/workspace/my/reminders').set(authed()).send({ title: 'x', repeat: 'NONE', startDate: 'bad' }).expect(400);
    let list = (await request(server).get('/api/v1/workspace/my/reminders').set(authed()).expect(200)).body as Json[];
    expect(list.find((x) => x.id === r.id)).toMatchObject({ done: false, timeOfDay: '09:30' });
    await request(server).post(`/api/v1/workspace/my/reminders/${r.id}/mark`).set(authed()).send({ done: true }).expect(201);
    list = (await request(server).get('/api/v1/workspace/my/reminders').set(authed()).expect(200)).body as Json[];
    expect(list.find((x) => x.id === r.id)?.done).toBe(true);
    await request(server).delete(`/api/v1/workspace/my/reminders/${r.id}`).set(authed()).expect(200);
  });

  it('正在进行中：加节点、完成节点、追加后续节点', async () => {
    const w = (await request(server).post('/api/v1/workspace/my/ongoing').set(authed()).send({ title: '测试持续工作', steps: ['第一步', '第二步'] }).expect(201)).body as Json;
    expect(w.steps).toHaveLength(2);
    await request(server).patch(`/api/v1/workspace/my/ongoing/${w.id}/steps/${w.steps[0].id}`).set(authed()).send({ done: true, result: '已完成' }).expect(200);
    await request(server).post(`/api/v1/workspace/my/ongoing/${w.id}/steps`).set(authed()).send({ title: '第三步' }).expect(201);
    const list = (await request(server).get('/api/v1/workspace/my/ongoing').set(authed()).expect(200)).body as Json[];
    const mine = list.find((x) => x.id === w.id)!;
    expect(mine.steps.map((s: Json) => s.done)).toEqual([true, false, false]);
    await request(server).delete(`/api/v1/workspace/my/ongoing/${w.id}`).set(authed()).expect(200);
  });

  it('配色方案：按账号保存，登录时带回', async () => {
    await request(server).put('/api/v1/workspace/my/theme').set(authed()).send({ theme: 'BAD THEME' }).expect(400);
    await request(server).put('/api/v1/workspace/my/theme').set(authed()).send({ theme: 'cloude' }).expect(200);
    expect(((await request(server).get('/api/v1/workspace/my/theme').set(authed()).expect(200)).body as Json).theme).toBe('cloude');
    const login = (await request(server).post('/api/v1/auth/login').send({ username: 'admin', password: 'Passw0rd!23' }).expect(201)).body as Json;
    expect(login.account.uiTheme).toBe('cloude');
  });

  it('快捷入口：整体保存、去重、过滤非法路径', async () => {
    const out = (await request(server).put('/api/v1/workspace/my/links').set(authed()).send({ links: [{ path: '/crm/customers', label: '客户' }, { path: '/crm/customers', label: '重复' }, { path: 'http://evil', label: '外链' }] }).expect(200)).body as Json[];
    expect(out.map((x) => x.path)).toEqual(['/crm/customers']);
    await request(server).put('/api/v1/workspace/my/links').set(authed()).send({ links: [] }).expect(200);
  });
});
