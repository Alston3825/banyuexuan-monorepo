import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 拍照导入纸质《产妇常规护理计划》统计表：每天一张整页照片，只登记新写的，已有的自动跳过。识别结果用造好的数据代替真实 AI。 */
describe('P8 拍照导入纸质护理计划表 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let prisma: PrismaService;
  let token: string;
  const tag = Date.now().toString().slice(-7);
  const authed = () => ({ Authorization: `Bearer ${token}` });
  let motherId: string;
  let babyId: string;
  let storeId: string;
  const name = `纸表导入${tag}`;
  const D = (n: number) => `2026-10-${String(n).padStart(2, '0')}`;

  async function sheetDoc(entries: Json[], patientName = name) {
    return prisma.careDocument.create({
      data: {
        tenantId: (await prisma.motherProfile.findUniqueOrThrow({ where: { id: motherId } })).tenantId,
        storeId,
        docType: 'CARE_PLAN',
        motherProfileId: motherId,
        status: 'DRAFT',
        extractStatus: 'DONE',
        extractData: { patientName, checkInDate: D(10), entries } as Json,
        extractWarnings: [{ field: 'entries.1.date', level: 'warn', message: '两次识别不一致' }],
        createdBy: 'E2E',
      },
    });
  }
  const preview = async (docId: string) => (await request(server).post('/api/v1/care/service-logs/import-preview').set(authed()).send({ documentId: docId }).expect(201)).body as Json;
  const commit = (docId: string, items: Json[]) => request(server).post('/api/v1/care/service-logs/import-commit').set(authed()).send({ documentId: docId, items });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    token = ((await request(server).post('/api/v1/auth/login').send({ username: 'admin', password: 'Passw0rd!23' }).expect(201)).body as Json).accessToken;
    const c = (await request(server).post('/api/v1/crm/customers').set(authed()).send({ name, phone: `135${tag}1`.slice(0, 11), source: 'ONLINE_AD' }).expect(201)).body as Json;
    const m = (await request(server).post('/api/v1/care/mother-profiles').set(authed()).send({ customerId: c.id, deliveryMethod: 'CESAREAN', babies: [{ name: '宝宝', gender: 'MALE' }] }).expect(201)).body as Json;
    motherId = m.id;
    storeId = m.storeId;
    babyId = ((await request(server).get(`/api/v1/care/mother-profiles/${motherId}`).set(authed()).expect(200)).body as Json).babies[0].id;
  });
  afterAll(async () => {
    await app.close();
  });

  it('1. 第一天的表：全是新的；血压没读全的标“没读全”；宣教项目带护理员/客户签字；名字对得上', async () => {
    const doc = await sheetDoc([
      { serviceCode: 'BP', date: D(10), systolic: 145, diastolic: 95 },
      { serviceCode: 'BP', date: D(11), systolic: 136 }, // 低压没读出来
      { serviceCode: 'PERINEAL', date: D(11) },
      { serviceCode: 'PERINEAL', date: D(12) },
      { serviceCode: 'EDU_ADMISSION', date: D(10), doneByName: '冯娟', clientSigned: 'YES' },
      { serviceCode: 'EDU_CHOKING', date: D(10), doneByName: '冯娟', clientSigned: 'YES' }, // 宝宝的项目
      { serviceCode: 'WEIGHT', date: D(17) }, // 体重行只写了预约日期、没有数值：忽略
    ]);
    const p = await preview(doc.id);
    expect(p.header.nameMatches).toBe(true);
    expect(p.counts).toMatchObject({ total: 6, planned: 1, new: 5, exists: 0, invalid: 1 });
    expect(p.items[1]).toMatchObject({ status: 'INVALID', uncertain: true });
    expect(p.items[5]).toMatchObject({ subject: 'BABY', clientSigned: true });

    // 没读全的血压直接提交会被拒；改好低压后可以登记
    await commit(doc.id, [{ serviceCode: 'BP', date: D(11), systolic: 136 }]).expect(400);
    const ok = (await commit(doc.id, [
      { serviceCode: 'BP', date: D(10), systolic: 145, diastolic: 95 },
      { serviceCode: 'BP', date: D(11), systolic: 136, diastolic: 93 },
      { serviceCode: 'PERINEAL', date: D(11) },
      { serviceCode: 'PERINEAL', date: D(12) },
      { serviceCode: 'EDU_ADMISSION', date: D(10), doneByName: '冯娟', clientSigned: true },
      { serviceCode: 'EDU_CHOKING', date: D(10), doneByName: '冯娟', clientSigned: true },
    ]).expect(201)).body as Json;
    expect(ok).toMatchObject({ created: 6, skipped: 0 });
    const logs = await prisma.careServiceLog.findMany({ where: { motherProfileId: motherId } });
    expect(logs).toHaveLength(6);
    expect(logs.find((l) => l.serviceCode === 'EDU_CHOKING')!.babyProfileId).toBe(babyId);
    expect(logs.find((l) => l.serviceCode === 'BP' && l.systolic === 136)!.diastolic).toBe(93);
    expect((await prisma.careDocument.findUniqueOrThrow({ where: { id: doc.id } })).status).toBe('CONFIRMED');
  });

  it('2. 第二天再拍同一张表（上面多写了新记录）：已登记的自动跳过，只列出新写的；同一天做两次的数个数', async () => {
    const doc = await sheetDoc([
      { serviceCode: 'BP', date: D(10), systolic: 145, diastolic: 95 },
      { serviceCode: 'BP', date: D(11), systolic: 136, diastolic: 93 },
      { serviceCode: 'BP', date: D(12), systolic: 124, diastolic: 84 }, // 新
      { serviceCode: 'PERINEAL', date: D(11) },
      { serviceCode: 'PERINEAL', date: D(12) },
      { serviceCode: 'PERINEAL', date: D(13) }, // 新
      { serviceCode: 'PHYSIO', date: D(13) }, // 新
      { serviceCode: 'PHYSIO', date: D(13) }, // 同一天第二次，也是新（系统里还没有这个项目）
      { serviceCode: 'EDU_ADMISSION', date: D(10), doneByName: '冯娟', clientSigned: 'YES' }, // 宣教只记一次，已有
      { serviceCode: 'EDU_DIET', date: D(10), doneByName: '冯娟', clientSigned: 'YES' }, // 新宣教
    ]);
    const p = await preview(doc.id);
    expect(p.counts).toMatchObject({ total: 10, new: 5, exists: 5, invalid: 0 });
    expect(p.items.filter((i: Json) => i.status === 'NEW').map((i: Json) => `${i.serviceCode}@${i.date}`)).toEqual(['BP@2026-10-12', 'PERINEAL@2026-10-13', 'PHYSIO@2026-10-13', 'PHYSIO@2026-10-13', 'EDU_DIET@2026-10-10']);
    // 就算把已有的也一起提交，后端也会再去重
    const all = p.items.map((i: Json) => ({ serviceCode: i.serviceCode, date: i.date, systolic: i.systolic, diastolic: i.diastolic, doneByName: i.doneByName, clientSigned: i.clientSigned }));
    const res = (await commit(doc.id, all).expect(201)).body as Json;
    expect(res).toMatchObject({ created: 5, skipped: 5 });
    expect(await prisma.careServiceLog.count({ where: { motherProfileId: motherId } })).toBe(11);
    // 第三次拍同一张：全都已有
    const p3 = await preview((await sheetDoc(all)).id);
    expect(p3.counts).toMatchObject({ new: 0, exists: 10 });
  });

  it('3. 名字对不上只提醒；未来日期/不认识的项目被标出；没有读到记录也不报错', async () => {
    const p = await preview((await sheetDoc([{ serviceCode: 'PERINEAL', date: '2099-01-01' }, { serviceCode: 'NOPE', date: D(11) }], '别人')).id);
    expect(p.header.nameMatches).toBe(false);
    expect(p.items.map((i: Json) => i.status)).toEqual(['INVALID', 'INVALID']);
    const empty = await preview((await sheetDoc([])).id);
    expect(empty.counts.total).toBe(0);
    await request(server).post('/api/v1/care/service-logs/import-preview').set(authed()).send({ documentId: 'nope' }).expect(404);
  });
});
