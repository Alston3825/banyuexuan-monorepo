import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * 护理档案 P1：资料留档（照片/PDF 上传与取图）+ 四张单次评估表（产妇入住、新生儿入所、妈妈出所、宝宝出所）。
 * 必须连独立测试库（DATABASE_URL 指向 banyuexuan_e2e / banyuexuan_test），不要连开发库。
 * AI 识别本身（读图模型）不在这里测——它依赖外部模型，用 ai-service 的单元测试 + 命令行试跑覆盖。
 */
describe('P7 护理档案：资料留档 + 单次评估表 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let prisma: PrismaService;

  const SEED_PASSWORD = process.env.E2E_SEED_PASSWORD ?? 'Passw0rd!23';
  const runTag = Date.now().toString().slice(-8);
  // 1x1 像素的 PNG，当作"照片"上传
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

  let adminToken: string;
  let staffToken: string;
  const authed = (t: string) => ({ Authorization: `Bearer ${t}` });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Json = any;

  let motherId: string;
  let babyId: string;
  let customerId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);

    const login = async (username: string) => (await request(server).post('/api/v1/auth/login').send({ username, password: SEED_PASSWORD }).expect(201)).body;
    adminToken = (await login('admin')).accessToken;
    staffToken = (await login('store_staff')).accessToken;

    const types = (await request(server).get('/api/v1/crm/customer-channel-types').set(authed(adminToken)).expect(200)).body;
    customerId = (
      await request(server)
        .post('/api/v1/crm/customers')
        .set(authed(adminToken))
        .send({ name: `E2E档案客户${runTag}`, phone: `136${runTag.slice(-6)}01`, channelTypeId: types[0].id })
        .expect(201)
    ).body.id;
    const mother = (
      await request(server)
        .post('/api/v1/care/mother-profiles')
        .set(authed(adminToken))
        .send({ customerId, deliveryMethod: 'CESAREAN', babies: [{ name: '宝宝A', gender: 'MALE' }] })
        .expect(201)
    ).body;
    motherId = mother.id;
    babyId = (await request(server).get(`/api/v1/care/mother-profiles/${motherId}`).set(authed(adminToken)).expect(200)).body.babies[0].id;
  });

  afterAll(async () => {
    await app.close();
  });

  const post = (path: string, body: Json, token = adminToken) => request(server).post(`/api/v1/care${path}`).set(authed(token)).send(body);
  const patch = (path: string, body: Json, token = adminToken) => request(server).patch(`/api/v1/care${path}`).set(authed(token)).send(body);

  it('1. 字段说明书：四张表齐全，每个字段有 key/label/kind，选择题带选项', async () => {
    const specs = (await request(server).get('/api/v1/care/assessments/specs').set(authed(staffToken)).expect(200)).body;
    expect(specs.map((s: Json) => s.type).sort()).toEqual(['BABY_ADMISSION', 'BABY_DISCHARGE', 'MOTHER_ADMISSION', 'MOTHER_DISCHARGE']);
    const fields = specs.flatMap((s: Json) => s.groups.flatMap((g: Json) => g.fields));
    expect(fields.every((f: Json) => f.key && f.label && f.kind)).toBe(true);
    expect(fields.filter((f: Json) => f.kind === 'single' || f.kind === 'multi').every((f: Json) => f.options.length > 0)).toBe(true);
  });

  it('2. 产妇入住评估：录入 → 数据按列入库；非法选项/日期/数字一次性报错；一个档案只能一份', async () => {
    const values = {
      age: 30,
      bloodType: 'A',
      deliveryMethod: 'CESAREAN',
      admissionDate: '2026-08-24',
      temperature: 36.3,
      bpSystolic: 114,
      bpDiastolic: 80,
      woundDressing: ['INTACT', 'DRY'],
      lochiaColor: 'PINK',
      handlingNotes: '1. 子宫：脐下2指\n2. 伤口：纱布覆盖',
      assessorName: '张倩',
    };
    const created = (await post('/assessments/MOTHER_ADMISSION', { profileId: motherId, values }).expect(201)).body;
    expect(created).toMatchObject({ age: 30, bloodType: 'A', temperature: 36.3, bpSystolic: 114, woundDressing: ['INTACT', 'DRY'], version: 0 });
    expect(created.admissionDate.slice(0, 10)).toBe('2026-08-24');

    // 数据确实落在独立的列里（不是 JSON 里），可以直接筛选统计
    const hit = await prisma.careMotherAdmission.count({ where: { bpSystolic: { gte: 110 }, deliveryMethod: 'CESAREAN', motherProfileId: motherId } });
    expect(hit).toBe(1);

    const bad = await post('/assessments/MOTHER_ADMISSION', { profileId: `${motherId}x`, values: {} }).expect(404);
    expect(bad.body.message).toContain('妈妈档案不存在');
    const dup = await post('/assessments/MOTHER_ADMISSION', { profileId: motherId, values }).expect(409);
    expect(dup.body.message).toContain('请直接修改');

    // 另一个类型下的非法值一次性报出
    const invalid = await post('/assessments/MOTHER_DISCHARGE', {
      profileId: motherId,
      values: { lochiaAmount: 'LOTS', dischargeDate: '2026/09/21', pulse: 'abc', woundStatus: ['NORMAL', 'BOGUS'] },
    }).expect(400);
    for (const word of ['恶露量', '出所日期', '脉搏', '伤口情况']) expect(invalid.body.message).toContain(word);
    expect(await post('/assessments/NOPE', { profileId: motherId, values: {} }).expect(404));
  });

  it('3. 修改评估：带版本号乐观锁；传 null 清空；没传的字段不动；留审计记录', async () => {
    const found = (await request(server).get(`/api/v1/care/assessments/overview`).query({ motherProfileId: motherId }).set(authed(adminToken)).expect(200)).body;
    const a = found.motherAdmission;
    const updated = (await patch(`/assessments/MOTHER_ADMISSION/${a.id}`, { version: a.version, values: { temperature: 36.8, assessorName: null } }).expect(200)).body;
    expect(updated).toMatchObject({ temperature: 36.8, assessorName: null, bpSystolic: 114, version: 1 });
    await patch(`/assessments/MOTHER_ADMISSION/${a.id}`, { version: 0, values: { temperature: 37 } }).expect(409);
    const audits = await prisma.auditLog.count({ where: { entityType: 'careMotherAdmission', entityId: a.id } });
    expect(audits).toBe(2);
  });

  it('4. 宝宝评估：按宝宝档案建；一个宝宝入所/出所各一份；多选字段可清空', async () => {
    const adm = (
      await post('/assessments/BABY_ADMISSION', {
        profileId: babyId,
        values: { birthWeightG: 3750, admissionWeightG: 3790, jaundiceForehead: 8.3, skin: ['DRY'], feedingMethod: 'FORMULA', formulaMl: 60 },
      }).expect(201)
    ).body;
    expect(adm).toMatchObject({ birthWeightG: 3750, jaundiceForehead: 8.3, skin: ['DRY'], babyProfileId: babyId });
    const cleared = (await patch(`/assessments/BABY_ADMISSION/${adm.id}`, { version: 0, values: { skin: [] } }).expect(200)).body;
    expect(cleared.skin).toBeNull();
    await post('/assessments/BABY_DISCHARGE', { profileId: babyId, values: { dischargeWeightG: 4930, admissionWeightG: 3790 } }).expect(201);
    // 把妈妈档案 id 当宝宝档案 id 传 → 找不到
    await post('/assessments/BABY_ADMISSION', { profileId: motherId, values: {} }).expect(404);

    const ov = (await request(server).get(`/api/v1/care/assessments/overview`).query({ motherProfileId: motherId }).set(authed(adminToken)).expect(200)).body;
    expect(ov.motherAdmission).toBeTruthy();
    expect(ov.motherDischarge).toBeNull();
    expect(ov.babies).toHaveLength(1);
    expect(ov.babies[0].admission.formulaMl).toBe(60);
    expect(ov.babies[0].discharge.dischargeWeightG).toBe(4930);
  });

  it('5. 资料留档：只留档类型上传即归档并可取回原图；已归档的不能删；坏文件被拒绝', async () => {
    const up = await request(server)
      .post('/api/v1/care/documents')
      .set(authed(staffToken))
      .field('docType', 'ORIENTATION')
      .field('motherProfileId', motherId)
      .attach('files', PNG, { filename: '宣教1.png', contentType: 'image/png' })
      .attach('files', PNG, { filename: '宣教2.png', contentType: 'image/png' })
      .expect(201);
    expect(up.body).toMatchObject({ docType: 'ORIENTATION', status: 'CONFIRMED', extractStatus: 'NONE' });
    expect(up.body.files).toHaveLength(2);
    expect(up.body.files[0].fileName).toBe('宣教1.png');

    const img = await request(server).get(`/api/v1/care/documents/${up.body.id}/files/${up.body.files[0].id}`).set(authed(staffToken)).expect(200);
    expect(img.headers['content-type']).toContain('image/png');
    expect(Buffer.from(img.body).equals(PNG)).toBe(true);

    // 只留档类资料刚上传（24 小时内）传错了可以删；结构化资料入库后见测试 6 仍不能删
    const wrong = (
      await request(server).post('/api/v1/care/documents').set(authed(adminToken)).field('docType', 'CHOKING_PROTOCOL').field('motherProfileId', motherId).attach('files', PNG, { filename: 'x.png', contentType: 'image/png' }).expect(201)
    ).body;
    await request(server).delete(`/api/v1/care/documents/${wrong.id}`).set(authed(adminToken)).expect(204);
    await request(server)
      .post('/api/v1/care/documents')
      .set(authed(adminToken))
      .field('docType', 'ORIENTATION')
      .field('motherProfileId', motherId)
      .attach('files', Buffer.from('not an image'), { filename: 'a.txt', contentType: 'text/plain' })
      .expect(400);
    await request(server).post('/api/v1/care/documents').set(authed(adminToken)).field('docType', 'ORIENTATION').field('motherProfileId', motherId).expect(400);
    const list = (await request(server).get('/api/v1/care/documents').query({ motherProfileId: motherId }).set(authed(adminToken)).expect(200)).body;
    expect(list.some((d: Json) => d.id === up.body.id)).toBe(true);
  });

  it('6. 结构化资料：上传后是待复核草稿；确认入库的评估表引用它后资料变"已确认"；类型/档案不匹配被拒绝；草稿可删', async () => {
    const upload = (docType: string, ids: Json) => {
      let r = request(server).post('/api/v1/care/documents').set(authed(adminToken)).field('docType', docType);
      for (const [k, v] of Object.entries(ids)) r = r.field(k, v as string);
      return r.attach('files', PNG, { filename: 'form.png', contentType: 'image/png' });
    };
    const draft = (await upload('MOTHER_DISCHARGE', { motherProfileId: motherId }).expect(201)).body;
    expect(draft.status).toBe('DRAFT');
    expect(['PENDING', 'RUNNING', 'FAILED', 'DONE']).toContain(draft.extractStatus); // 测试环境没有读图模型，会很快 FAILED，不影响后续

    // 宝宝类资料必须指定宝宝
    await upload('BABY_DISCHARGE', { motherProfileId: motherId }).expect(400);
    // 类型不一致
    await post('/assessments/MOTHER_ADMISSION', { profileId: motherId, documentId: draft.id, values: {} }).expect(409); // 已有一份，先走重复校验
    const other = (await upload('BABY_ADMISSION', { babyProfileId: babyId }).expect(201)).body;
    await post('/assessments/MOTHER_DISCHARGE', { profileId: motherId, documentId: other.id, values: {} }).expect(400);

    const discharge = (await post('/assessments/MOTHER_DISCHARGE', { profileId: motherId, documentId: draft.id, values: { pulse: 81, lochiaAmount: 'FEW' } }).expect(201)).body;
    expect(discharge.documentId).toBe(draft.id);
    expect(discharge.document.files).toHaveLength(1);
    const after = (await request(server).get(`/api/v1/care/documents/${draft.id}`).set(authed(adminToken)).expect(200)).body;
    expect(after.status).toBe('CONFIRMED');
    await request(server).delete(`/api/v1/care/documents/${draft.id}`).set(authed(adminToken)).expect(409);

    // 没被引用的草稿可以删
    await request(server).delete(`/api/v1/care/documents/${other.id}`).set(authed(adminToken)).expect(204);
    await request(server).get(`/api/v1/care/documents/${other.id}`).set(authed(adminToken)).expect(404);
  });

  it('7. 店员（日常操作账号）可以查看、录入评估和上传资料', async () => {
    await request(server).get(`/api/v1/care/assessments/overview`).query({ motherProfileId: motherId }).set(authed(staffToken)).expect(200);
    const mother2 = (await request(server).post('/api/v1/care/mother-profiles').set(authed(staffToken)).send({ customerId }).expect(201)).body;
    await post('/assessments/MOTHER_ADMISSION', { profileId: mother2.id, values: { age: 28 } }, staffToken).expect(201);
  });

  it('8. 删除建错的宝宝档案：没有护理数据的可删（序号自动重排）；已有评估表/资料的拒绝；母婴档案列表带房号客户宝宝', async () => {
    const extra = (await request(server).post('/api/v1/care/baby-profiles').set(authed(adminToken)).send({ motherProfileId: motherId, name: '多建的宝宝', gender: 'FEMALE' }).expect(201)).body;
    expect(extra.sequenceNo).toBe(2);
    const third = (await request(server).post('/api/v1/care/baby-profiles').set(authed(adminToken)).send({ motherProfileId: motherId, name: '第三个', gender: 'MALE' }).expect(201)).body;
    expect(third.sequenceNo).toBe(3);

    // 宝宝 A 已有入所评估 → 拒绝
    const conflict = await request(server).delete(`/api/v1/care/baby-profiles/${babyId}`).set(authed(adminToken)).expect(409);
    expect(conflict.body.message).toContain('新生儿入所评估');
    // 删掉第 2 个，第 3 个自动变成第 2 个
    await request(server).delete(`/api/v1/care/baby-profiles/${extra.id}`).set(authed(adminToken)).expect(204);
    await request(server).get(`/api/v1/care/baby-profiles/${extra.id}`).set(authed(adminToken)).expect(404);
    const babies = (await request(server).get('/api/v1/care/baby-profiles').query({ motherProfileId: motherId }).set(authed(adminToken)).expect(200)).body;
    expect(babies.map((b: Json) => [b.name, b.sequenceNo])).toEqual([['宝宝A', 1], ['第三个', 2]]);
    await request(server).delete(`/api/v1/care/baby-profiles/${third.id}`).set(authed(adminToken)).expect(204);

    // 列表：带客户姓名、宝宝，房号（没关联入住时为空）
    const list = (await request(server).get('/api/v1/care/mother-profiles').query({ customerId }).set(authed(adminToken)).expect(200)).body;
    const mine = list.find((m: Json) => m.id === motherId);
    expect(mine.customer.name).toBe(`E2E档案客户${runTag}`);
    expect(mine.babies).toHaveLength(1);
    expect(mine.occupancy).toBeNull();
  });

  it('9. 母婴档案列表带房号：关联入住后返回房号，客户姓名、宝宝信息都在列表里（不用点进去）', async () => {
    const stores = (await request(server).get('/api/v1/platform/stores').set(authed(adminToken)).expect(200)).body;
    const storeId = stores[0].id;
    const types = (await request(server).get('/api/v1/room/types').set(authed(adminToken)).expect(200)).body;
    const roomTypeId =
      types[0]?.id ?? (await request(server).post('/api/v1/room/types').set(authed(adminToken)).send({ code: `E2E7-${runTag}`, name: 'E2E 房型7' }).expect(201)).body.id;
    const room = (await request(server).post('/api/v1/room/rooms').set(authed(adminToken)).send({ storeId, roomTypeId, roomNo: `R7${runTag.slice(-4)}`, floor: '7F' }).expect(201)).body;
    const customer = (
      await request(server).post('/api/v1/crm/customers').set(authed(adminToken)).send({ name: `E2E有房号客户${runTag}`, phone: `137${runTag.slice(-6)}07`, source: 'OTHER' }).expect(201)
    ).body;
    const occ = (
      await request(server)
        .post('/api/v1/room/occupancies')
        .set(authed(adminToken))
        .send({ roomId: room.id, storeId, customerId: customer.id, plannedCheckIn: '2027-03-01T00:00:00.000Z', plannedCheckOut: '2027-04-12T00:00:00.000Z' })
        .expect(201)
    ).body;
    const mother = (
      await request(server)
        .post('/api/v1/care/mother-profiles')
        .set(authed(adminToken))
        .send({ customerId: customer.id, occupancyId: occ.id, babies: [{ name: '小宝', gender: 'FEMALE', birthWeightGrams: 3300 }] })
        .expect(201)
    ).body;
    const list = (await request(server).get('/api/v1/care/mother-profiles').query({ customerId: customer.id }).set(authed(adminToken)).expect(200)).body;
    const row = list.find((m: Json) => m.id === mother.id);
    expect(row.occupancy.room.roomNo).toBe(room.roomNo);
    expect(row.customer.name).toBe(`E2E有房号客户${runTag}`);
    expect(row.babies[0]).toMatchObject({ name: '小宝', gender: 'FEMALE', birthWeightGrams: 3300 });

    // 主责护理师：从员工账号里选 → 护理看板、房态看板都读得到（还没指派时为空）
    const boardOn = '2027-03-05T00:00:00.000Z';
    const roomBoard = async () => (await request(server).get('/api/v1/room/rooms/board').query({ storeId, date: boardOn }).set(authed(adminToken)).expect(200)).body.find((e: Json) => e.room.id === room.id);
    const careBoard = async () => (await request(server).get('/api/v1/care/board').query({ storeId, date: boardOn }).set(authed(adminToken)).expect(200)).body.find((e: Json) => e.room.id === room.id);
    expect((await roomBoard()).careBrief).toMatchObject({ nurseName: null, level: null });
    expect((await careBoard()).care.nurse).toBeNull();

    const options = (await request(server).get('/api/v1/care/mother-profiles/nurse-options').query({ storeId }).set(authed(staffToken)).expect(200)).body;
    expect(options.length).toBeGreaterThan(0);
    const nurse = options[0];
    await request(server).patch(`/api/v1/care/mother-profiles/${mother.id}`).set(authed(adminToken)).send({ primaryNurseId: 'no-such-account', version: mother.version }).expect(400);
    const upd = (await request(server).patch(`/api/v1/care/mother-profiles/${mother.id}`).set(authed(adminToken)).send({ primaryNurseId: nurse.id, version: mother.version }).expect(200)).body;
    expect((await roomBoard()).careBrief.nurseName).toBe(nurse.name);
    expect((await careBoard()).care.nurse).toMatchObject({ id: nurse.id, name: nurse.name });
    expect((await request(server).get(`/api/v1/care/mother-profiles/${mother.id}`).set(authed(adminToken)).expect(200)).body.primaryNurse.realName).toBe(nurse.name);
    // 传 null = 清除
    await request(server).patch(`/api/v1/care/mother-profiles/${mother.id}`).set(authed(adminToken)).send({ primaryNurseId: null, version: upd.version }).expect(200);
    expect((await roomBoard()).careBrief.nurseName).toBeNull();

    // 看板“敏”字：没填 → 不亮；入住评估过敏史“有”/写了过敏说明 → 亮并带说明；说明写“无”不算
    expect((await careBoard()).care).toMatchObject({ hasAllergyTag: false, allergyNote: null });
    const adm = (await post('/assessments/MOTHER_ADMISSION', { profileId: mother.id, values: { allergyHistory: 'NO', allergyNote: '无' } }).expect(201)).body;
    expect((await careBoard()).care.hasAllergyTag).toBe(false);
    await request(server).patch(`/api/v1/care/assessments/MOTHER_ADMISSION/${adm.id}`).set(authed(adminToken)).send({ values: { allergyHistory: 'YES', allergyNote: '鸡蛋过敏' }, version: adm.version }).expect(200);
    expect((await careBoard()).care).toMatchObject({ hasAllergyTag: true, allergyNote: '鸡蛋过敏' });
  });

  it('10. 宝宝名下已有评估表/纸质资料：普通账号不能删；管理员需输入宝宝名字确认，连同评估表和资料一起删除', async () => {
    const baby = (await request(server).post('/api/v1/care/baby-profiles').set(authed(adminToken)).send({ motherProfileId: motherId, name: '录错的宝宝', gender: 'MALE' }).expect(201)).body;
    await post('/assessments/BABY_ADMISSION', { profileId: baby.id, values: { birthWeightG: 3000 } }).expect(201);
    await request(server)
      .post('/api/v1/care/documents')
      .set(authed(adminToken))
      .field('docType', 'BABY_DISCHARGE')
      .field('babyProfileId', baby.id)
      .attach('files', PNG, { filename: 'x.png', contentType: 'image/png' })
      .expect(201);

    const check = (await request(server).get(`/api/v1/care/baby-profiles/${baby.id}/delete-check`).set(authed(adminToken)).expect(200)).body;
    expect(check.blockers).toEqual([]);
    expect(check.attached).toEqual(['新生儿入所评估', '1 份纸质资料']);
    expect(check.canForceDelete).toBe(true);
    const staffCheck = (await request(server).get(`/api/v1/care/baby-profiles/${baby.id}/delete-check`).set(authed(staffToken)).expect(200)).body;
    expect(staffCheck.canForceDelete).toBe(false);

    const del = (token: string, qs = '') => request(server).delete(`/api/v1/care/baby-profiles/${baby.id}${qs}`).set(authed(token));
    await del(adminToken).expect(409); // 不带 force
    await del(staffToken, '?force=true&confirmName=录错的宝宝').expect(403); // 没有管理员权限
    await del(adminToken, '?force=true').expect(400); // 没有输入名字
    await del(adminToken, `?force=true&confirmName=${encodeURIComponent('别的名字')}`).expect(400);
    await del(adminToken, `?force=true&confirmName=${encodeURIComponent('录错的宝宝')}`).expect(204);

    expect(await prisma.careBabyAdmission.count({ where: { babyProfileId: baby.id } })).toBe(0);
    expect(await prisma.careDocument.count({ where: { babyProfileId: baby.id } })).toBe(0);
    await request(server).get(`/api/v1/care/baby-profiles/${baby.id}`).set(authed(adminToken)).expect(404);
  });

  it('11. 日常护理记录：一天一份（妈妈栏 + 宝宝栏 + 喂养行），懒创建、整天保存、乐观锁、汇总自动算', async () => {
    const customer = (
      await request(server).post('/api/v1/crm/customers').set(authed(adminToken)).send({ name: `E2E日常记录客户${runTag}`, phone: `139${runTag.slice(-6)}11`, source: 'OTHER' }).expect(201)
    ).body;
    const mother = (await post('/mother-profiles', { customerId: customer.id, babies: [{ name: '日常宝', gender: 'MALE', birthDate: '2026-10-01T00:00:00.000Z' }] }).expect(201)).body;
    const babyDailyId = (await request(server).get(`/api/v1/care/mother-profiles/${mother.id}`).set(authed(adminToken)).expect(200)).body.babies[0].id;
    const get = (path: string, token = adminToken) => request(server).get(`/api/v1/care${path}`).set(authed(token));
    const put = (body: Json, token = adminToken) => request(server).put('/api/v1/care/daily/day').set(authed(token)).send(body);

    const specs = (await get('/daily/specs', staffToken).expect(200)).body;
    expect(specs.mother.length).toBeGreaterThan(0);
    expect(specs.feeding.map((c: Json) => c.key)).toContain('formulaMl');

    // 日历：至少有今天一行，未填
    const days = (await get(`/daily/days?motherProfileId=${mother.id}`).expect(200)).body;
    expect(days.days.length).toBeGreaterThanOrEqual(1);
    expect(days.days[0]).toMatchObject({ date: days.today, filled: false });
    const date = days.today;

    // 没有记录：返回 record=null + 默认值（宝宝出生天数按出生日期算）
    const empty = (await get(`/daily/day?motherProfileId=${mother.id}&date=${date}`).expect(200)).body;
    expect(empty.record).toBeNull();
    expect(empty.babies[0].record).toBeNull();
    expect(empty.babies[0].defaultAgeDays).toBeGreaterThanOrEqual(0);

    // 校验：喂养行时间格式、宝宝不属于该档案、非法选项
    const base = { motherProfileId: mother.id, date, mother: {}, babies: [{ babyProfileId: babyDailyId, values: {}, feedings: [{ time: '25:99' }] }] };
    expect((await put(base).expect(400)).body.message).toContain('时间');
    await put({ ...base, babies: [{ babyProfileId: 'nope', values: {} }] }).expect(400);
    await put({ ...base, mother: { milk: 'LOTS' }, babies: [] }).expect(400);

    // 整天保存（创建）：喂养行 2:00 补零成 02:00，汇总自动算
    const body = {
      motherProfileId: mother.id,
      date,
      mother: { motherTemperature: 36.0, motherPulse: 93, motherBpSystolic: 127, motherBpDiastolic: 78, breast: ['NORMAL'], lochiaStatus: 'NOT_CLEAN', motherPlan: '会阴擦洗消毒' },
      babies: [
        {
          babyProfileId: babyDailyId,
          values: { weightG: 3850, tempMorning: 36.2, tempEvening: 36.5, umbilical: ['NOT_FALLEN'], jaundiceForehead: 7.0, babyPlan: '抚触、晒黄疸' },
          feedings: [
            { time: '14:07', formulaMl: 60, urine: 'YES' },
            { time: '2:00', formulaMl: 60, urine: 'YES', stool: 'YES', stoolColor: 'YELLOW', stoolAmount: 'DOT' },
            { time: '10:27', formulaMl: 80, urine: 'YES', stool: 'YES' },
          ],
        },
      ],
    };
    const saved = (await put(body).expect(200)).body;
    expect(saved.record).toMatchObject({ motherPulse: 93, motherBpSystolic: 127, lochiaStatus: 'NOT_CLEAN', version: 0 });
    expect(saved.babies[0].record).toMatchObject({ weightG: 3850, babyPlan: '抚触、晒黄疸' });
    expect(saved.babies[0].feedings.map((f: Json) => f.time)).toEqual(['02:00', '10:27', '14:07']);
    expect(saved.babies[0].summary).toMatchObject({ formulaTotalMl: 200, urineCount: 3, stoolCount: 2, feedCount: 3 });
    // 数据在独立列里，可直接筛选统计
    expect(await prisma.careFeedingEntry.count({ where: { formulaMl: { gte: 60 }, babyDaily: { babyProfileId: babyDailyId } } })).toBe(3);

    // 已有记录：不带版本号/版本过期 → 409；带对版本 → 更新，喂养行整体替换
    await put(body).expect(409);
    await put({ ...body, version: 5 }).expect(409);
    const updated = (await put({ ...body, version: 0, mother: { motherTemperature: 36.6 }, babies: [{ babyProfileId: babyDailyId, values: {}, feedings: [{ time: '08:00', formulaMl: 70 }] }] }).expect(200)).body;
    expect(updated.record).toMatchObject({ motherTemperature: 36.6, motherPulse: 93, version: 1 }); // 没传的字段不动
    expect(updated.babies[0].feedings).toHaveLength(1);
    expect(updated.babies[0].summary.formulaTotalMl).toBe(70);

    const after = (await get(`/daily/days?motherProfileId=${mother.id}`).expect(200)).body;
    expect(after.days.find((d: Json) => d.date === date)).toMatchObject({ filled: true, babiesFilled: 1 });
    // 店员可录入
    await put({ ...body, version: 1, mother: { motherPulse: 90 }, babies: [] }, staffToken).expect(200);
    // 日常护理记录的纸质照片：类型必须是 DAILY_RECORD
    const photo = (
      await request(server).post('/api/v1/care/documents').set(authed(adminToken)).field('docType', 'DAILY_RECORD').field('motherProfileId', mother.id).field('babyProfileId', babyDailyId).field('autoExtract', 'false').attach('files', PNG, { filename: 'd.png', contentType: 'image/png' }).expect(201)
    ).body;
    expect(photo).toMatchObject({ docType: 'DAILY_RECORD', extractStatus: 'NONE' });
    await put({ ...body, version: 2, documentId: photo.id, babies: [] }).expect(200);
    const confirmed = (await get(`/documents/${photo.id}`).expect(200)).body;
    expect(confirmed.status).toBe('CONFIRMED');
  });

  it('12. 用药委托书：新签 → 变更（上一份自动变已替换、保留变化过程）→ 停药；日常记录按当天有效委托给出可选药品', async () => {
    const customer = (
      await request(server).post('/api/v1/crm/customers').set(authed(adminToken)).send({ name: `E2E用药客户${runTag}`, phone: `139${runTag.slice(-6)}12`, source: 'OTHER' }).expect(201)
    ).body;
    const mother = (await post('/mother-profiles', { customerId: customer.id, babies: [{ name: '用药宝', gender: 'FEMALE' }] }).expect(201)).body;
    const baby = (await request(server).get(`/api/v1/care/mother-profiles/${mother.id}`).set(authed(adminToken)).expect(200)).body.babies[0].id;
    const med = (body: Json, token = adminToken) => request(server).post('/api/v1/care/medications').set(authed(token)).send(body);
    const medPatch = (id: string, body: Json, token = adminToken) => request(server).patch(`/api/v1/care/medications/${id}`).set(authed(token)).send(body);
    const list = async () => (await request(server).get('/api/v1/care/medications').query({ babyProfileId: baby }).set(authed(adminToken)).expect(200)).body;

    const specs = (await request(server).get('/api/v1/care/medications/specs').set(authed(staffToken)).expect(200)).body;
    expect(specs.item.map((c: Json) => c.key)).toEqual(expect.arrayContaining(['drugName', 'route', 'times', 'dose']));

    // 校验
    const header = { authDate: '2026-09-05', medicationStart: '2026-09-05', signerName: '家属甲', nurseName: '护士乙' };
    await med({ babyProfileId: baby, header, items: [] }).expect(400);
    expect((await med({ babyProfileId: baby, header, items: [{ route: 'ORAL' }] }).expect(400)).body.message).toContain('药名');
    await med({ babyProfileId: baby, header, items: [{ drugName: 'AD', route: 'NASAL' }] }).expect(400);
    await med({ babyProfileId: baby, header, items: [{ drugName: 'AD', times: ['NIGHT'] }] }).expect(400);
    await med({ header, items: [{ drugName: 'AD' }] }).expect(400);

    // 新签一份（带签字原件照片）
    const photo = (
      await request(server).post('/api/v1/care/documents').set(authed(adminToken)).field('docType', 'MEDICATION_AUTH').field('motherProfileId', mother.id).field('babyProfileId', baby).field('autoExtract', 'false').attach('files', PNG, { filename: 'w.png', contentType: 'image/png' }).expect(201)
    ).body;
    const first = (
      await med({
        babyProfileId: baby,
        documentId: photo.id,
        header,
        items: [
          { drugName: 'AD', route: 'ORAL', times: ['MORNING'], dose: '1滴', courseDays: 14, familySigned: 'YES' },
          { drugName: '护臀膏', route: 'EXTERNAL', times: ['MORNING', 'EVENING'], notes: '换尿布后涂' },
        ],
      }).expect(201)
    ).body;
    expect(first).toMatchObject({ status: 'ACTIVE', signerName: '家属甲', previousAuthId: null, motherProfileId: mother.id });
    expect(first.items.map((i: Json) => [i.drugName, i.route])).toEqual([['AD', 'ORAL'], ['护臀膏', 'EXTERNAL']]);
    expect(first.items[1].times).toEqual(['MORNING', 'EVENING']);
    expect(first.document.files).toHaveLength(1);
    expect((await request(server).get(`/api/v1/care/documents/${photo.id}`).set(authed(adminToken)).expect(200)).body.status).toBe('CONFIRMED');
    // 别的宝宝/类型不对的资料不能挂
    await med({ babyProfileId: baby, documentId: 'nope', header, items: [{ drugName: 'X' }] }).expect(400);

    // 日常记录：当天有效的委托药品出现在对应宝宝下（日期在委托之后）
    const day = (await request(server).get('/api/v1/care/daily/day').query({ motherProfileId: mother.id, date: '2026-09-20' }).set(authed(adminToken)).expect(200)).body;
    expect(day.babies[0].activeMedications.map((m: Json) => m.drugName)).toEqual(['AD', '护臀膏']);
    const before = (await request(server).get('/api/v1/care/daily/day').query({ motherProfileId: mother.id, date: '2026-09-01' }).set(authed(adminToken)).expect(200)).body;
    expect(before.babies[0].activeMedications).toEqual([]); // 委托之前的日子没有

    // 修改仍有效的这份：药品行整体替换，乐观锁
    const edited = (await medPatch(first.id, { version: 0, header: { remark: '更正' }, items: [{ drugName: 'AD', route: 'ORAL', times: ['MORNING'], dose: '2滴' }, { drugName: '护臀膏', route: 'EXTERNAL' }] }).expect(200)).body;
    expect(edited).toMatchObject({ remark: '更正', version: 1 });
    expect(edited.items[0].dose).toBe('2滴');
    await medPatch(first.id, { version: 0, header: {}, items: [] }).expect(409);

    // 变更：必须写变更说明；上一份自动变"已替换"
    await med({ babyProfileId: baby, previousAuthId: first.id, header, items: [{ drugName: 'AD', route: 'ORAL', times: ['MORNING', 'EVENING'], dose: '2滴' }] }).expect(400);
    const second = (
      await med({ babyProfileId: baby, previousAuthId: first.id, changeNote: '医生调整：每天两次', header: { ...header, authDate: '2026-09-10' }, items: [{ drugName: 'AD', route: 'ORAL', times: ['MORNING', 'EVENING'], dose: '2滴' }] }).expect(201)
    ).body;
    expect(second).toMatchObject({ status: 'ACTIVE', previousAuthId: first.id, changeNote: '医生调整：每天两次' });
    const all = await list();
    expect(all.map((a: Json) => a.status)).toEqual(['ACTIVE', 'SUPERSEDED']);
    // 历史不能再改内容，也不能再基于它变更
    await medPatch(first.id, { version: 2, header: { remark: 'x' }, items: [] }).expect(409);
    await med({ babyProfileId: baby, previousAuthId: first.id, changeNote: 'x', header, items: [{ drugName: 'AD' }] }).expect(409);
    // 日常记录只按"有效"的那份给药
    const day2 = (await request(server).get('/api/v1/care/daily/day').query({ motherProfileId: mother.id, date: '2026-09-20' }).set(authed(adminToken)).expect(200)).body;
    expect(day2.babies[0].activeMedications.map((m: Json) => m.drugName)).toEqual(['AD']);

    // 停药：要写原因
    await request(server).post(`/api/v1/care/medications/${second.id}/stop`).set(authed(adminToken)).send({ version: 0, note: ' ' }).expect(400);
    const stopped = (await request(server).post(`/api/v1/care/medications/${second.id}/stop`).set(authed(adminToken)).send({ version: 0, note: '病愈停药' }).expect(201)).body;
    expect(stopped).toMatchObject({ status: 'STOPPED', stopNote: '病愈停药' });
    await request(server).post(`/api/v1/care/medications/${second.id}/stop`).set(authed(adminToken)).send({ version: 1, note: '再停' }).expect(409);
    const day3 = (await request(server).get('/api/v1/care/daily/day').query({ motherProfileId: mother.id, date: '2026-09-20' }).set(authed(adminToken)).expect(200)).body;
    expect(day3.babies[0].activeMedications).toEqual([]);

    // 店员可新签；删除宝宝时用药委托书算"评估表/资料"类，管理员确认后连同删除
    await med({ babyProfileId: baby, header: {}, items: [{ drugName: '店员录入' }] }, staffToken).expect(201);
    const check = (await request(server).get(`/api/v1/care/baby-profiles/${baby}/delete-check`).set(authed(adminToken)).expect(200)).body;
    expect(check.attached.join()).toContain('用药委托书');
  });

  it('13. 母婴档案自动关联入住：先建档后办入住 / 先入住后建档，房号都能对上；手动改关联', async () => {
    const stores = (await request(server).get('/api/v1/platform/stores').set(authed(adminToken)).expect(200)).body;
    const storeId = stores[0].id;
    const types = (await request(server).get('/api/v1/room/types').set(authed(adminToken)).expect(200)).body;
    const roomTypeId =
      types[0]?.id ?? (await request(server).post('/api/v1/room/types').set(authed(adminToken)).send({ code: `E2E13-${runTag}`, name: 'E2E 房型13' }).expect(201)).body.id;
    const mkRoom = async (n: string) =>
      (await request(server).post('/api/v1/room/rooms').set(authed(adminToken)).send({ storeId, roomTypeId, roomNo: `R13${n}${runTag.slice(-3)}`, floor: '3F' }).expect(201)).body;
    const mkCustomer = async (n: string) =>
      (await request(server).post('/api/v1/crm/customers').set(authed(adminToken)).send({ name: `E2E关联${n}${runTag}`, phone: `139${runTag.slice(-5)}${n}`.slice(0, 11).padEnd(11, '0'), source: 'OTHER' }).expect(201)).body;
    const reserve = async (roomId: string, customerId: string, from: string, to: string) =>
      (await request(server).post('/api/v1/room/occupancies').set(authed(adminToken)).send({ roomId, storeId, customerId, plannedCheckIn: from, plannedCheckOut: to }).expect(201)).body;
    const listRow = async (customerId: string, motherId: string) =>
      (await request(server).get('/api/v1/care/mother-profiles').query({ customerId }).set(authed(adminToken)).expect(200)).body.find((m: Json) => m.id === motherId);

    // A：先建档（没有入住），之后预订/办理入住 → 自动关联
    const roomA = await mkRoom('A');
    const cA = await mkCustomer('1');
    const motherA = (await post('/mother-profiles', { customerId: cA.id }).expect(201)).body;
    expect((await listRow(cA.id, motherA.id)).occupancy).toBeNull();
    const occA = await reserve(roomA.id, cA.id, '2027-05-01T00:00:00.000Z', '2027-06-01T00:00:00.000Z');
    expect((await listRow(cA.id, motherA.id)).occupancy.room.roomNo).toBe(roomA.roomNo);
    await request(server).post(`/api/v1/room/occupancies/${occA.id}/check-in`).set(authed(adminToken)).send({ version: occA.version }).expect(201);
    expect((await listRow(cA.id, motherA.id)).occupancy).toMatchObject({ status: 'CHECKED_IN', room: { roomNo: roomA.roomNo } });

    // B：先有入住（已预订），后建档 → 建档时自动关联
    const roomB = await mkRoom('B');
    const cB = await mkCustomer('2');
    await reserve(roomB.id, cB.id, '2027-05-01T00:00:00.000Z', '2027-06-01T00:00:00.000Z');
    const motherB = (await post('/mother-profiles', { customerId: cB.id }).expect(201)).body;
    expect((await listRow(cB.id, motherB.id)).occupancy.room.roomNo).toBe(roomB.roomNo);

    // C：手动改关联（换房：新预订自动不抢已有关联；编辑里选另一条入住）
    const roomC = await mkRoom('C');
    const occC = await reserve(roomC.id, cB.id, '2027-07-01T00:00:00.000Z', '2027-08-01T00:00:00.000Z');
    const cur = await listRow(cB.id, motherB.id);
    expect(cur.occupancy.room.roomNo).toBe(roomB.roomNo); // 已有有效关联，不被新预订抢走
    await patch(`/mother-profiles/${motherB.id}`, { version: cur.version, occupancyId: occC.id }).expect(200);
    expect((await listRow(cB.id, motherB.id)).occupancy.room.roomNo).toBe(roomC.roomNo);
  });

  it('14. 个人化护理计划：护理长起草 → 护理主任审核生效 → 7 天评审（版本留痕）→ 主任查房直接调整；服务执行记录按等级标准统计', async () => {
    const customer = (
      await request(server).post('/api/v1/crm/customers').set(authed(adminToken)).send({ name: `E2E计划客户${runTag}`, phone: `139${runTag.slice(-6)}14`, source: 'OTHER' }).expect(201)
    ).body;
    const mother = (await post('/mother-profiles', { customerId: customer.id, babies: [{ name: '计划宝', gender: 'MALE' }] }).expect(201)).body;
    const babyId = (await request(server).get(`/api/v1/care/mother-profiles/${mother.id}`).set(authed(adminToken)).expect(200)).body.babies[0].id;
    const pv = (body: Json, token = staffToken) => request(server).post('/api/v1/care/plan-versions').set(authed(token)).send(body);
    const act = (id: string, action: string, body: Json, token: string) => request(server).post(`/api/v1/care/plan-versions/${id}/${action}`).set(authed(token)).send(body);
    const versions = async () => (await request(server).get('/api/v1/care/plan-versions').query({ motherProfileId: mother.id }).set(authed(adminToken)).expect(200)).body;

    const std = (await request(server).get('/api/v1/care/plan-versions/standards').set(authed(staffToken)).expect(200)).body;
    expect(std.levels.map((l: Json) => l.code)).toEqual(['LEVEL1', 'LEVEL2', 'LEVEL3']);
    expect(std.levels[2].services.find((x: Json) => x.code === 'BP').freqText).toContain('入所前 3 天每天 1 次'); // 三级 = 宣教标准

    // 起草（护理员/护理长可起草）；等级必填；同一对象同时只能有一个未处理版本
    await pv({ motherProfileId: mother.id }).expect(400);
    const v1 = (await pv({ motherProfileId: mother.id, level: 'LEVEL2', assessmentSummary: '剖宫产第4天，妊高', focusPoints: '监测血压、伤口', measures: [{ title: '血压', content: '每日监测', frequency: '每天1次' }] }).expect(201)).body;
    expect(v1).toMatchObject({ versionNo: 1, status: 'DRAFT', source: 'INITIAL', level: 'LEVEL2' });
    await pv({ motherProfileId: mother.id, level: 'LEVEL3' }).expect(409);
    const edited = (await request(server).patch(`/api/v1/care/plan-versions/${v1.id}`).set(authed(staffToken)).send({ version: 0, focusPoints: '监测血压、伤口、乳房' }).expect(200)).body;
    expect(edited.focusPoints).toContain('乳房');
    // 提交审核；普通账号不能审核，主任（管理员）可以
    await act(v1.id, 'submit', { version: edited.version }, staffToken).expect(201);
    await act(v1.id, 'approve', { version: 2 }, staffToken).expect(403);
    await request(server).patch(`/api/v1/care/plan-versions/${v1.id}`).set(authed(staffToken)).send({ version: 2, focusPoints: 'x' }).expect(409); // 待审核不能改
    const active1 = (await act(v1.id, 'approve', { version: 2, comment: '同意' }, adminToken).expect(201)).body;
    expect(active1).toMatchObject({ status: 'ACTIVE', reviewComment: '同意' });
    const due = new Date(active1.nextReviewDue).getTime() - Date.now();
    expect(due).toBeGreaterThan(5 * 86400_000);
    expect(due).toBeLessThan(8 * 86400_000);

    // 7 天评审：必须写上阶段执行结果；驳回要写原因；驳回后可改再提交
    await pv({ motherProfileId: mother.id, level: 'LEVEL2', focusPoints: '继续监测' }).expect(400);
    const v2 = (await pv({ motherProfileId: mother.id, level: 'LEVEL3', progressNote: '血压已稳定，伤口愈合良好', focusPoints: '常规护理，注意休息' }).expect(201)).body;
    expect(v2).toMatchObject({ versionNo: 2, source: 'REGULAR_REVIEW', previousVersionId: v1.id });
    await act(v2.id, 'submit', { version: 0 }, staffToken).expect(201);
    await act(v2.id, 'reject', { version: 1, comment: ' ' }, adminToken).expect(400);
    const rejected = (await act(v2.id, 'reject', { version: 1, comment: '请补充具体措施' }, adminToken).expect(201)).body;
    expect(rejected.status).toBe('REJECTED');
    const redo = (await request(server).patch(`/api/v1/care/plan-versions/${v2.id}`).set(authed(staffToken)).send({ version: rejected.version, measures: [{ title: '休息', content: '保证睡眠', frequency: '每天' }] }).expect(200)).body;
    expect(redo.status).toBe('DRAFT');
    await act(v2.id, 'submit', { version: redo.version }, staffToken).expect(201);
    await act(v2.id, 'approve', { version: redo.version + 1 }, adminToken).expect(201);
    let all = await versions();
    expect(all.map((x: Json) => [x.versionNo, x.status])).toEqual([[2, 'ACTIVE'], [1, 'SUPERSEDED']]);
    expect(all[1].endedAt).toBeTruthy();

    // 护理主任查房：直接调整并生效（需要审核权限、必须写调整原因）
    await pv({ motherProfileId: mother.id, level: 'LEVEL1', source: 'DIRECTOR_ROUND', adjustReason: '查房发现伤口渗液', directActivate: true }, staffToken).expect(403);
    await pv({ motherProfileId: mother.id, level: 'LEVEL1', source: 'DIRECTOR_ROUND', directActivate: true }, adminToken).expect(400);
    const v3 = (await pv({ motherProfileId: mother.id, level: 'LEVEL1', source: 'DIRECTOR_ROUND', adjustReason: '查房发现伤口渗液', focusPoints: '伤口换药，重点监护', directActivate: true }, adminToken).expect(201)).body;
    expect(v3).toMatchObject({ versionNo: 3, status: 'ACTIVE', source: 'DIRECTOR_ROUND' });
    all = await versions();
    expect(all.map((x: Json) => x.status)).toEqual(['ACTIVE', 'SUPERSEDED', 'SUPERSEDED']);

    // 宝宝的计划是独立的一条线
    const bv = (await pv({ motherProfileId: mother.id, babyProfileId: babyId, level: 'LEVEL3', focusPoints: '黄疸监测' }).expect(201)).body;
    expect(bv).toMatchObject({ versionNo: 1, babyProfileId: babyId });
    await act(bv.id, 'submit', { version: 0 }, staffToken).expect(201);
    await act(bv.id, 'approve', { version: 1 }, adminToken).expect(201); // 宝宝的计划生效后，宝宝项目按它自己的等级

    // 到期评审提醒
    await prisma.carePlanVersion.update({ where: { id: v3.id }, data: { nextReviewDue: new Date('2020-01-01T00:00:00.000Z') } });
    const dueList = (await request(server).get('/api/v1/care/plan-versions/due').set(authed(adminToken)).expect(200)).body;
    expect(dueList.reviewDue.map((x: Json) => x.id)).toContain(v3.id);

    // ---- 服务执行记录 ----
    const summary = async () => (await request(server).get('/api/v1/care/service-logs/summary').query({ motherProfileId: mother.id }).set(authed(staffToken)).expect(200)).body;
    const sum = await summary();
    expect(sum.motherLevel).toBe('LEVEL1');
    expect(sum.stayDay).toBeGreaterThanOrEqual(1);
    const bp = sum.rows.find((r: Json) => r.code === 'BP');
    expect(bp).toMatchObject({ done: 0, level: 'LEVEL1' });
    expect(bp.freqText).toContain('每天 3 次'); // 一级：妊高前三天每天 3 次
    expect(bp.expected).toBe(3);
    expect(sum.rows.find((r: Json) => r.code === 'BABY_BATH')).toMatchObject({ babyProfileId: babyId, level: 'LEVEL3', freqText: '每 2 天 1 次' }); // 宝宝按自己的计划等级
    expect(sum.rows.find((r: Json) => r.code === 'PHYSIO').expected).toBeNull(); // 理疗：按恢复情况安排

    // 所有项目都要记时间；血压/体重这两个测量类项目还必须带数值
    const log = (body: Json, token = staffToken) => request(server).post('/api/v1/care/service-logs').set(authed(token)).send({ motherProfileId: mother.id, doneTime: '00:05', ...body });
    const bpVals = { systolic: 120, diastolic: 80 };
    const l1 = (await log({ serviceCode: 'BP', doneByName: '护士乙', ...bpVals }).expect(201)).body;
    expect(l1).toMatchObject({ doneTime: '00:05', systolic: 120, diastolic: 80 });
    await log({ serviceCode: 'BP', doneTime: '00:10', systolic: 118, diastolic: 76 }).expect(201); // 用凌晨时间，避免测试时刻早于它被当成“未来”
    await log({ serviceCode: 'BP' }).expect(400); // 血压缺数值
    await log({ serviceCode: 'BP', systolic: 80, diastolic: 120 }).expect(400); // 高低压填反
    await log({ serviceCode: 'BP', systolic: 300, diastolic: 80 }).expect(400);
    await log({ serviceCode: 'BP', doneTime: undefined, ...bpVals }).expect(400);
    await log({ serviceCode: 'BP', doneTime: '25:61', ...bpVals }).expect(400);
    await log({ serviceCode: 'WEIGHT' }).expect(400); // 体重缺数值
    await log({ serviceCode: 'WEIGHT', weightKg: 10 }).expect(400);
    const w = (await log({ serviceCode: 'WEIGHT', weightKg: 58.456 }).expect(201)).body;
    expect(Number(w.weightKg)).toBe(58.46);
    await log({ serviceCode: 'NOPE' }).expect(400);
    await log({ serviceCode: 'BABY_BATH' }).expect(400); // 宝宝项目要选宝宝
    await log({ serviceCode: 'BP', babyProfileId: babyId, ...bpVals }).expect(400); // 妈妈项目不能选宝宝
    await log({ serviceCode: 'BP', doneDate: '2999-01-01', ...bpVals }).expect(400);
    const bath = (await log({ serviceCode: 'BABY_BATH', babyProfileId: babyId, doneDate: '2026-10-01', systolic: 120, diastolic: 80 }).expect(201)).body;
    expect(bath.systolic).toBeNull(); // 非测量项目不接收数值
    await log({ serviceCode: 'EDU_ADMISSION', clientSigned: true }).expect(201);
    await log({ serviceCode: 'EDU_ADMISSION' }).expect(409); // 宣教项目入住期间只需 1 次
    const after = await summary();
    expect(after.rows.find((r: Json) => r.code === 'BP').done).toBe(2);
    expect(after.rows.find((r: Json) => r.code === 'BP')).toMatchObject({ measure: 'BP' });
    expect(after.rows.find((r: Json) => r.code === 'BP').logs[0]).toMatchObject({ time: '00:05', systolic: 120, diastolic: 80 });
    expect(after.rows.find((r: Json) => r.code === 'WEIGHT').logs[0].weightKg).toBe(58.46);
    expect(after.rows.find((r: Json) => r.code === 'BABY_BATH').measure).toBeNull();
    expect(after.rows.find((r: Json) => r.code === 'EDU_ADMISSION').logs[0]).toMatchObject({ clientSigned: true });
    expect(after.rows.find((r: Json) => r.code === 'BABY_BATH').done).toBe(1);
    await request(server).delete(`/api/v1/care/service-logs/${l1.id}`).set(authed(staffToken)).expect(204);
    expect((await summary()).rows.find((r: Json) => r.code === 'BP').done).toBe(1);
  });

  it('15. 统计筛选：按指标+条件+日期筛日常记录；出所护理小结汇总住店期间的数据', async () => {
    const customer = (
      await request(server).post('/api/v1/crm/customers').set(authed(adminToken)).send({ name: `E2E统计客户${runTag}`, phone: `139${runTag.slice(-6)}15`, source: 'OTHER' }).expect(201)
    ).body;
    const mother = (await post('/mother-profiles', { customerId: customer.id, babies: [{ name: '统计宝', gender: 'FEMALE' }] }).expect(201)).body;
    const baby = (await request(server).get(`/api/v1/care/mother-profiles/${mother.id}`).set(authed(adminToken)).expect(200)).body.babies[0].id;
    const put = (date: string, mom: Json, babyVals: Json, feedings: Json[]) =>
      request(server).put('/api/v1/care/daily/day').set(authed(adminToken)).send({ motherProfileId: mother.id, date, mother: mom, babies: [{ babyProfileId: baby, values: babyVals, feedings }] }).expect(200);
    await put('2026-10-01', { motherTemperature: 36.5, motherBpSystolic: 118, motherBpDiastolic: 76 }, { jaundiceForehead: 8.2, jaundiceChest: 9.1, weightG: 3500, tempMorning: 36.4 }, [{ time: '08:00', formulaMl: 60, urine: 'YES' }]);
    await put('2026-10-02', { motherTemperature: 37.8, motherBpSystolic: 145, motherBpDiastolic: 92 }, { jaundiceForehead: 13.4, jaundiceCanthus: 12.1, weightG: 3600, tempMorning: 37.6 }, [
      { time: '08:00', formulaMl: 80, urine: 'YES', stool: 'YES' },
      { time: '12:00', formulaMl: 80, urine: 'YES' },
    ]);
    const q = async (metric: string, op: string, value: number, extra = '') =>
      (await request(server).get(`/api/v1/care/stats/query?metric=${metric}&op=${op}&value=${value}&from=2026-10-01&to=2026-10-31${extra}`).set(authed(staffToken)).expect(200)).body;

    expect((await request(server).get('/api/v1/care/stats/metrics').set(authed(staffToken)).expect(200)).body.length).toBeGreaterThanOrEqual(8);
    const jaundice = await q('BABY_JAUNDICE', 'gte', 12);
    const mine = jaundice.rows.filter((r: Json) => r.customerName === `E2E统计客户${runTag}`);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ date: '2026-10-02', value: 13.4, babyName: '统计宝' }); // 取三个部位里最高的
    expect((await q('BABY_TEMP', 'gte', 37.5)).rows.filter((r: Json) => r.customerName === `E2E统计客户${runTag}`)).toHaveLength(1);
    expect((await q('BABY_FORMULA_DAY', 'gte', 100)).rows.filter((r: Json) => r.customerName === `E2E统计客户${runTag}`).map((r: Json) => r.value)).toEqual([160]);
    expect((await q('BABY_STOOL_DAY', 'eq', 0)).rows.filter((r: Json) => r.customerName === `E2E统计客户${runTag}`).map((r: Json) => r.date)).toEqual(['2026-10-01']);
    const bp = (await q('MOTHER_BP_SYS', 'gte', 140)).rows.filter((r: Json) => r.customerName === `E2E统计客户${runTag}`);
    expect(bp).toHaveLength(1);
    expect(bp[0].babyName).toBeNull();
    expect((await q('BABY_JAUNDICE', 'gte', 12, '&storeId=nope')).rows).toHaveLength(0);
    await request(server).get('/api/v1/care/stats/query?metric=NOPE&op=gte&value=1').set(authed(staffToken)).expect(400);
    await request(server).get('/api/v1/care/stats/query?metric=BABY_WEIGHT&op=between&value=1').set(authed(staffToken)).expect(400);

    // 出所小结
    await post('/assessments/BABY_DISCHARGE', { profileId: baby, values: { dischargeWeightG: 4100, dischargeTips: '回家多排气' } }).expect(201);
    const sum = (await request(server).get(`/api/v1/care/summary/${mother.id}`).set(authed(staffToken)).expect(200)).body;
    expect(sum.customerName).toBe(`E2E统计客户${runTag}`);
    expect(sum.mother.daily).toMatchObject({ recordedDays: 2, maxSystolic: 145 });
    expect(sum.babies[0].daily).toMatchObject({ recordedDays: 2, jaundiceMax: 13.4, avgFormulaMlPerDay: 110 });
    expect(sum.babies[0].daily.weightTrend.map((w: Json) => w.v)).toEqual([3500, 3600]);
    expect(sum.babies[0].discharge).toMatchObject({ weightG: 4100, tips: '回家多排气' });
  });
});
