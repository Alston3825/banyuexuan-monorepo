import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { parseSheetDate } from '../src/satisfaction/satisfaction-extraction.service';
import { nameSimilarity } from '../src/inventory/common/item-similarity';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 满意度调查：手工录入/核对/确认 → 统计（均分、满意率、分布、最低项）与意见汇总 */
describe('P8 满意度调查 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
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
    token = ((await request(server).post('/api/v1/auth/login').send({ username: 'admin', password: 'Passw0rd!23' }).expect(201)).body as Json).accessToken as string;
  });
  afterAll(async () => {
    await app.close();
  });

  it('纸上手写日期解析：10.24 / 10/24 / 2026.10.24', () => {
    const now = new Date(Date.UTC(2026, 10, 2));
    expect(parseSheetDate('10.24', now)?.toISOString().slice(0, 10)).toBe('2026-10-24');
    expect(parseSheetDate('10/7', now)?.toISOString().slice(0, 10)).toBe('2026-10-07');
    expect(parseSheetDate('2026.10.24', now)?.toISOString().slice(0, 10)).toBe('2026-10-24');
    expect(parseSheetDate('12.30', now)?.toISOString().slice(0, 10)).toBe('2025-12-30'); // 11月份看到12.30=去年
    expect(parseSheetDate('', now)).toBeNull();
  });

  it('表单定义：三张表共 7+9+8 个评分项，分值 0~12', async () => {
    const s = (await request(server).get('/api/v1/satisfaction/surveys/specs').set(authed()).expect(200)).body as Json;
    expect(s.forms.map((f: Json) => f.groups.flatMap((g: Json) => g.items).length)).toEqual([7, 9, 8]);
    expect(s.scoreMax).toBe(12);
  });

  it('手工录入 → 核对 → 确认 → 统计/意见汇总；未确认的不计入', async () => {
    const mk = async (name: string, scores: Json, extra: Json = {}) => {
      const c = (await request(server).post('/api/v1/satisfaction/surveys').set(authed()).field('formNo', '2').expect(201)).body as Json;
      await request(server).patch(`/api/v1/satisfaction/surveys/${c.id}`).set(authed()).send({ customerName: `${name}${tag}`, stewardName: `管家${tag}`, surveyDate: '2026-10-17', scores, ...extra }).expect(200);
      return c.id as string;
    };
    const a = await mk('甲', { q1: 11, q4: 10, s4: 12 }, { suggestion: `菜品搭配注意颜色，重复率不要太高${tag}`, praise: `护理师小王很细心${tag}` });
    const b = await mk('乙', { q1: 5, q4: 8, s4: 10 });
    await request(server).patch(`/api/v1/satisfaction/surveys/${a}`).set(authed()).send({ scores: { q1: 13 } }).expect(400); // 超范围
    const draft = (await request(server).get('/api/v1/satisfaction/surveys/stats').query({ formNo: 2, steward: `管家${tag}` }).set(authed()).expect(200)).body as Json;
    expect(draft.total).toBe(0);
    expect(draft.pending).toBe(2);
    await request(server).post(`/api/v1/satisfaction/surveys/${a}/confirm`).set(authed()).expect(201);
    await request(server).post(`/api/v1/satisfaction/surveys/${b}/confirm`).set(authed()).expect(201);

    const st = (await request(server).get('/api/v1/satisfaction/surveys/stats').query({ formNo: 2, steward: `管家${tag}` }).set(authed()).expect(200)).body as Json;
    expect(st.total).toBe(2);
    const f2 = st.forms[0];
    const q1 = f2.groups[0].items.find((i: Json) => i.key === 'q1');
    expect(q1).toMatchObject({ count: 2, avg: 8, good: 1, bad: 1 });
    expect(q1.histogram[11]).toBe(1);
    expect(f2.avg).toBeCloseTo(9.33, 1); // (11+10+12+5+8+10)/6
    expect(st.lowItems[0].key).toBe('q1');
    expect(st.staff[0]).toMatchObject({ name: `管家${tag}`, surveys: 2 });

    const cm = (await request(server).get('/api/v1/satisfaction/surveys/comments').query({ formNo: 2, steward: `管家${tag}` }).set(authed()).expect(200)).body as Json[];
    expect(cm).toHaveLength(1);
    expect(cm[0].suggestion).toContain('重复率');
    await request(server).delete(`/api/v1/satisfaction/surveys/${a}`).set(authed()).expect(204);
    await request(server).delete(`/api/v1/satisfaction/surveys/${b}`).set(authed()).expect(204);
  });

  it('什么都没填不能确认；没选客户不能确认', async () => {
    const c = (await request(server).post('/api/v1/satisfaction/surveys').set(authed()).field('formNo', '1').expect(201)).body as Json;
    await request(server).post(`/api/v1/satisfaction/surveys/${c.id}/confirm`).set(authed()).expect(400);
    await request(server).patch(`/api/v1/satisfaction/surveys/${c.id}`).set(authed()).send({ scores: { env1: 11 } }).expect(200);
    await request(server).post(`/api/v1/satisfaction/surveys/${c.id}/confirm`).set(authed()).expect(400);
    await request(server).delete(`/api/v1/satisfaction/surveys/${c.id}`).set(authed()).expect(204);
  });
});
