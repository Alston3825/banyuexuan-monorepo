import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { parseSheetDate } from '../src/satisfaction/satisfaction-extraction.service';
import { PrismaService } from '../src/prisma/prisma.service';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 满意度调查：手工录入/核对/确认 → 统计（均分、满意率、分布、最低项）与意见汇总 */
describe('P8 满意度调查 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let token: string;
  let prisma: PrismaService;
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

  it('纸上手写日期解析：10.24 / 10/24 / 2026.10.24', () => {
    const now = new Date(Date.UTC(2026, 10, 2));
    expect(parseSheetDate('10.24', now)?.toISOString().slice(0, 10)).toBe('2026-10-24');
    expect(parseSheetDate('10/7', now)?.toISOString().slice(0, 10)).toBe('2026-10-07');
    expect(parseSheetDate('2026.10.24', now)?.toISOString().slice(0, 10)).toBe('2026-10-24');
    expect(parseSheetDate('12.30', now)?.toISOString().slice(0, 10)).toBe('2025-12-30'); // 11月份看到12.30=去年
    expect(parseSheetDate('', now)).toBeNull();
  });

  let tpl: Record<number, string> = {};
  it('表单定义：内置三张模板共 7+9+8 个评分项，分值 0~12', async () => {
    const s = (await request(server).get('/api/v1/satisfaction/surveys/specs').set(authed()).expect(200)).body as Json;
    const builtin = s.templates.filter((t: Json) => [1, 2, 3].includes(t.sortNo) && t.day).slice(0, 3);
    expect(builtin.map((f: Json) => f.groups.flatMap((g: Json) => g.items).length)).toEqual([7, 9, 8]);
    expect(builtin.map((t: Json) => t.day)).toEqual([5, 15, 25]);
    tpl = { 1: builtin[0].id, 2: builtin[1].id, 3: builtin[2].id };
    expect(s.scoreMax).toBe(12);
  });

  it('模板：新建 → 改条款 → 复制 → 启用/停用；有调查用过的不能删', async () => {
    const t = (await request(server).post('/api/v1/satisfaction/templates').set(authed()).send({ name: `测试模板${tag}`, day: 10, groups: [{ title: '环境', items: [{ label: '房间整洁' }, { label: '噪音' }] }] }).expect(201)).body as Json;
    const items = t.groups[0].items;
    expect(items).toHaveLength(2);
    expect(items[0].key).toBeTruthy();
    // 改其中一条，其余保持 key 不变
    const up = (await request(server).patch(`/api/v1/satisfaction/templates/${t.id}`).set(authed()).send({ groups: [{ key: t.groups[0].key, title: '环境', items: [{ key: items[0].key, label: '房间非常整洁' }, items[1], { label: '新增一条' }] }] }).expect(200)).body as Json;
    expect(up.groups[0].items.map((i: Json) => i.label)).toEqual(['房间非常整洁', '噪音', '新增一条']);
    expect(up.groups[0].items[0].key).toBe(items[0].key);
    await request(server).patch(`/api/v1/satisfaction/templates/${t.id}`).set(authed()).send({ groups: [] }).expect(400);
    await request(server).patch(`/api/v1/satisfaction/templates/${t.id}`).set(authed()).send({ day: 0 }).expect(400);
    const dup = (await request(server).post(`/api/v1/satisfaction/templates/${t.id}/duplicate`).set(authed()).expect(201)).body as Json;
    expect(dup.status).toBe('INACTIVE');
    // 停用的模板不能用来新建调查
    await request(server).post('/api/v1/satisfaction/surveys').set(authed()).field('templateId', dup.id).expect(400);
    const sv = (await request(server).post('/api/v1/satisfaction/surveys').set(authed()).field('templateId', t.id).expect(201)).body as Json;
    await request(server).delete(`/api/v1/satisfaction/templates/${t.id}`).set(authed()).expect(409);
    await request(server).delete(`/api/v1/satisfaction/surveys/${sv.id}`).set(authed()).expect(204);
    await request(server).delete(`/api/v1/satisfaction/templates/${t.id}`).set(authed()).expect(204);
    await request(server).delete(`/api/v1/satisfaction/templates/${dup.id}`).set(authed()).expect(204);
  });

  it('上传 txt 文件识别生成模板草稿（AI 不可用时跳过）', async () => {
    const res = await request(server).post('/api/v1/satisfaction/templates/import').set(authed()).attach('file', Buffer.from('客户满意度调查\n一、餐饮\n1. 菜品口味\n2. 上菜速度\n二、护理\n3. 护理师态度'), 'x.txt');
    if (res.status !== 201) return; // 没有 AI 服务时（500/502）不判失败
    const t = res.body as Json;
    expect(t.status).toBe('INACTIVE');
    expect(t.source).toBe('UPLOAD');
    expect(t.groups.flatMap((g: Json) => g.items).length).toBeGreaterThanOrEqual(3);
    await request(server).delete(`/api/v1/satisfaction/templates/${t.id}`).set(authed()).expect(204);
  }, 120000);

  it('手工录入 → 核对 → 确认 → 统计/意见汇总；未确认的不计入', async () => {
    const mk = async (name: string, scores: Json, extra: Json = {}) => {
      const c = (await request(server).post('/api/v1/satisfaction/surveys').set(authed()).field('templateId', tpl[2]).expect(201)).body as Json;
      await request(server).patch(`/api/v1/satisfaction/surveys/${c.id}`).set(authed()).send({ customerName: `${name}${tag}`, stewardName: `管家${tag}`, surveyDate: '2026-10-17', scores, ...extra }).expect(200);
      return c.id as string;
    };
    const a = await mk('甲', { q1: 11, q4: 10, s4: 12 }, { suggestion: `菜品搭配注意颜色，重复率不要太高${tag}`, praise: `护理师小王很细心${tag}` });
    const b = await mk('乙', { q1: 5, q4: 8, s4: 10 });
    await request(server).patch(`/api/v1/satisfaction/surveys/${a}`).set(authed()).send({ scores: { q1: 13 } }).expect(400); // 超范围
    const draft = (await request(server).get('/api/v1/satisfaction/surveys/stats').query({ templateId: tpl[2], steward: `管家${tag}` }).set(authed()).expect(200)).body as Json;
    expect(draft.total).toBe(0);
    expect(draft.pending).toBe(2);
    await request(server).post(`/api/v1/satisfaction/surveys/${a}/confirm`).set(authed()).expect(201);
    await request(server).post(`/api/v1/satisfaction/surveys/${b}/confirm`).set(authed()).expect(201);

    const st = (await request(server).get('/api/v1/satisfaction/surveys/stats').query({ templateId: tpl[2], steward: `管家${tag}` }).set(authed()).expect(200)).body as Json;
    expect(st.total).toBe(2);
    const f2 = st.forms.find((f: Json) => f.templateId === tpl[2]);
    const q1 = f2.groups[0].items.find((i: Json) => i.key === 'q1');
    expect(q1).toMatchObject({ count: 2, avg: 8, good: 1, bad: 1 });
    expect(q1.histogram[11]).toBe(1);
    expect(f2.avg).toBeCloseTo(9.33, 1); // (11+10+12+5+8+10)/6
    expect(st.lowItems[0].key).toBe('q1');
    expect(st.staff[0]).toMatchObject({ name: `管家${tag}`, surveys: 2 });

    const cm = (await request(server).get('/api/v1/satisfaction/surveys/comments').query({ templateId: tpl[2], steward: `管家${tag}` }).set(authed()).expect(200)).body as Json[];
    expect(cm).toHaveLength(1);
    expect(cm[0].suggestion).toContain('重复率');
    await request(server).delete(`/api/v1/satisfaction/surveys/${a}`).set(authed()).expect(204);
    await request(server).delete(`/api/v1/satisfaction/surveys/${b}`).set(authed()).expect(204);
  });

  it('什么都没填不能确认；没选客户不能确认', async () => {
    const c = (await request(server).post('/api/v1/satisfaction/surveys').set(authed()).field('templateId', tpl[1]).expect(201)).body as Json;
    await request(server).post(`/api/v1/satisfaction/surveys/${c.id}/confirm`).set(authed()).expect(400);
    await request(server).patch(`/api/v1/satisfaction/surveys/${c.id}`).set(authed()).send({ scores: { env1: 11 } }).expect(200);
    await request(server).post(`/api/v1/satisfaction/surveys/${c.id}/confirm`).set(authed()).expect(400);
    await request(server).delete(`/api/v1/satisfaction/surveys/${c.id}`).set(authed()).expect(204);
  });

  it('待办提醒：入住第5天 → 客服收到；拖过5天 → 店长收到监督；录入后两边都消失', async () => {
    const login = async (u: string) => ((await request(server).post('/api/v1/auth/login').send({ username: u, password: 'Passw0rd!23' }).expect(201)).body as Json).accessToken as string;
    const mine = async (u: string) => ((await request(server).get('/api/v1/workspace/todos').set({ Authorization: `Bearer ${await login(u)}` }).expect(200)).body.items as Json[]).filter((i) => i.kind === 'SATISFACTION' && i.title.includes(`提醒客${tag}`));
    const store = await prisma.store.findFirstOrThrow({ where: { name: { contains: '示例店' } } });
    const room = await prisma.room.findFirstOrThrow({ where: { storeId: store.id } });
    const admin = await prisma.account.findFirstOrThrow({ where: { username: 'admin' } });
    const cs = await prisma.account.findFirst({ where: { username: 'customer_service' } });
    const csRole = await prisma.role.findFirstOrThrow({ where: { tenantId: store.tenantId, code: 'CUSTOMER_SERVICE' } });
    let csName = 'customer_service';
    if (!cs) {
      const a = (await request(server).post('/api/v1/platform/accounts').set(authed()).send({ username: `cs_${tag}`, realName: '客服测试', password: 'Passw0rd!23', storeId: store.id }).expect(201)).body as Json;
      await prisma.accountRoleAssignment.create({ data: { tenantId: store.tenantId, accountId: a.id, roleId: csRole.id, scopeType: 'STORE', scopeId: store.id, grantedBy: 'test' } });
      csName = `cs_${tag}`;
    }
    const customer = await prisma.customer.create({ data: { tenantId: store.tenantId, customerNo: `SAT${tag}`, name: `提醒客${tag}`, phone: `139${tag}0`.slice(0, 11), primaryStoreId: store.id, createdBy: admin.id } });
    const mkOcc = (daysAgo: number) => prisma.roomOccupancy.create({ data: { tenantId: store.tenantId, occupancyNo: `OC${tag}${daysAgo}`, roomId: room.id, storeId: store.id, customerId: customer.id, status: 'CHECKED_IN', plannedCheckIn: new Date(Date.now() - daysAgo * 86_400_000), plannedCheckOut: new Date(Date.now() + 20 * 86_400_000), actualCheckInAt: new Date(Date.now() - daysAgo * 86_400_000), createdBy: admin.id } });
    const occ = await mkOcc(4); // 入住当天算第 1 天 → 今天是第 5 天
    const csItems = await mine(csName);
    expect(csItems).toHaveLength(1);
    expect(csItems[0].title).toContain('该做');
    expect(csItems[0].overdue).toBe(false);
    expect(csItems[0].link).toContain(`customerId=${customer.id}`);
    expect((await mine('store_manager')).filter((i) => i.title.includes('监督'))).toHaveLength(0);

    await prisma.roomOccupancy.update({ where: { id: occ.id }, data: { actualCheckInAt: new Date(Date.now() - 11 * 86_400_000) } }); // 第 12 天 → 拖了 7 天
    const late = await mine(csName);
    expect(late[0]).toMatchObject({ overdue: true, level: 'danger' });
    expect((await mine('store_manager')).filter((i) => i.title.includes('监督'))).toHaveLength(1);

    // 录入一份该模板的调查 → 提醒取消
    const tplId = late[0].key.split(':')[2] as string;
    const sv = (await request(server).post('/api/v1/satisfaction/surveys').set(authed()).field('templateId', tplId).field('customerId', customer.id).expect(201)).body as Json;
    expect(await mine(csName)).toHaveLength(0);
    expect((await mine('store_manager')).filter((i) => i.title.includes('监督'))).toHaveLength(0);
    await request(server).delete(`/api/v1/satisfaction/surveys/${sv.id}`).set(authed()).expect(204);
    expect(await mine(csName)).toHaveLength(1); // 删掉记录又恢复提醒（说明是现算的）
    await prisma.roomOccupancy.update({ where: { id: occ.id }, data: { status: 'CHECKED_OUT' } }); // 退房后不再提醒
    expect(await mine(csName)).toHaveLength(0);
  });
});
