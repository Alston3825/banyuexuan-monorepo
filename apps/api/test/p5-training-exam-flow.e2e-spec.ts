import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import type { ExamAttempt, TrainingExam } from '@prisma/client';
import { AppModule } from '../src/app.module';

/**
 * P5 员工培训与考核端到端集成测试：试卷/题目为总部统一培训标准(仅SUPER_ADMIN维护)，
 * 参加考试对全体员工开放(用店长账号代表普通员工)，简答题批阅由店长一步给分完成。
 * 见业务规则确认记录"员工培训与考核模块启动前"。
 */
describe('P5 员工培训与考核 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;

  const SEED_PASSWORD = 'Passw0rd!23';
  const runTag = Date.now().toString().slice(-8);

  let adminToken: string;
  let storeManagerToken: string;
  let examId: string;
  let singleChoiceQuestionId: string;
  let shortAnswerQuestionId: string;

  function authed(token: string) {
    return { Authorization: `Bearer ${token}` };
  }
  function body<T>(res: request.Response): T {
    return res.body as T;
  }
  interface LoginResponse {
    accessToken: string;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();

    const adminLogin = await request(server).post('/api/v1/auth/login').send({ username: 'admin', password: SEED_PASSWORD }).expect(201);
    adminToken = body<LoginResponse>(adminLogin).accessToken;
    const storeManagerLogin = await request(server).post('/api/v1/auth/login').send({ username: 'store_manager', password: SEED_PASSWORD }).expect(201);
    storeManagerToken = body<LoginResponse>(storeManagerLogin).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. 店长无权限创建试卷（总部统一培训标准口径）', async () => {
    await request(server)
      .post('/api/v1/training/exams')
      .set(authed(storeManagerToken))
      .send({ title: `不应创建成功-${runTag}`, questions: [{ order: 1, type: 'TRUE_FALSE', content: 'x', correctAnswer: true, score: 10 }] })
      .expect(403);
  });

  it('2. 超管创建试卷：含单选/多选/判断/简答四种题型，默认DRAFT状态', async () => {
    const res = await request(server)
      .post('/api/v1/training/exams')
      .set(authed(adminToken))
      .send({
        title: `E2E培训考核测试-${runTag}`,
        studyMaterial: '请先阅读护理规范手册第一章',
        passScore: 60,
        questions: [
          { order: 1, type: 'SINGLE_CHOICE', content: '产后42天是标准月子期吗？', options: [{ key: 'A', text: '是' }, { key: 'B', text: '否' }], correctAnswer: ['A'], score: 40 },
          { order: 2, type: 'MULTIPLE_CHOICE', content: '以下哪些是护理异常需要上报的情况？', options: [{ key: 'A', text: '体温异常' }, { key: 'B', text: '正常喂养' }, { key: 'C', text: '黄疸加重' }], correctAnswer: ['A', 'C'], score: 30 },
          { order: 3, type: 'TRUE_FALSE', content: '护理师可以自行修改护理方案模板。', correctAnswer: false, score: 10 },
          { order: 4, type: 'SHORT_ANSWER', content: '简述新生儿黄疸的常见护理要点。', score: 20 },
        ],
      })
      .expect(201);
    const exam = body<TrainingExam & { questions: { id: string; type: string }[] }>(res);
    expect(exam.status).toBe('DRAFT');
    expect(exam.questions).toHaveLength(4);
    examId = exam.id;
    singleChoiceQuestionId = exam.questions.find((q) => q.type === 'SINGLE_CHOICE')!.id;
    shortAnswerQuestionId = exam.questions.find((q) => q.type === 'SHORT_ANSWER')!.id;
  });

  it('3. DRAFT状态试卷不允许作答', async () => {
    const res = await request(server)
      .post('/api/v1/training/attempts')
      .set(authed(storeManagerToken))
      .send({ examId, answers: [{ questionId: singleChoiceQuestionId, selectedKeys: ['A'] }] })
      .expect(400);
    expect(body<{ message: string }>(res).message).toContain('未发布');
  });

  it('4. 发布试卷后，已发布状态不允许整体替换题目列表', async () => {
    const published = await request(server)
      .patch(`/api/v1/training/exams/${examId}`)
      .set(authed(adminToken))
      .send({ status: 'PUBLISHED', version: 0 })
      .expect(200);
    expect(body<TrainingExam>(published).status).toBe('PUBLISHED');

    const res = await request(server)
      .patch(`/api/v1/training/exams/${examId}`)
      .set(authed(adminToken))
      .send({ questions: [{ order: 1, type: 'TRUE_FALSE', content: 'x', correctAnswer: true, score: 10 }], version: 1 })
      .expect(400);
    expect(body<{ message: string }>(res).message).toContain('已发布');
  });

  it('5. 员工在"可参加考试"列表看到已发布试卷，题目不包含正确答案', async () => {
    const list = await request(server).get('/api/v1/training/attempts/available-exams').set(authed(storeManagerToken)).expect(200);
    const found = body<{ id: string; questions: Record<string, unknown>[] }[]>(list).find((e) => e.id === examId);
    expect(found).toBeTruthy();
    expect(found!.questions.every((q) => !('correctAnswer' in q))).toBe(true);

    const detail = await request(server).get(`/api/v1/training/attempts/exams/${examId}`).set(authed(storeManagerToken)).expect(200);
    expect(body<{ questions: Record<string, unknown>[] }>(detail).questions.every((q) => !('correctAnswer' in q))).toBe(true);
  });

  it('6. 提交作答：客观题自动判分，含简答题时状态为PENDING_GRADING', async () => {
    const res = await request(server)
      .post('/api/v1/training/attempts')
      .set(authed(storeManagerToken))
      .send({
        examId,
        answers: [
          { questionId: singleChoiceQuestionId, selectedKeys: ['A'] }, // 正确，40分
          { questionId: shortAnswerQuestionId, textAnswer: '保持皮肤清洁，观察黄疸范围与精神状态，必要时及时就医。' },
        ],
      })
      .expect(201);
    const attempt = body<ExamAttempt>(res);
    expect(attempt.autoScore).toBe(40);
    expect(attempt.status).toBe('PENDING_GRADING');
    expect(attempt.totalScore).toBeNull();

    const mine = await request(server).get('/api/v1/training/attempts/mine').set(authed(storeManagerToken)).expect(200);
    expect(body<ExamAttempt[]>(mine).some((a) => a.id === attempt.id)).toBe(true);

    const pending = await request(server).get('/api/v1/training/attempts/pending-grading').set(authed(storeManagerToken)).expect(200);
    expect(body<ExamAttempt[]>(pending).some((a) => a.id === attempt.id)).toBe(true);

    // 批阅简答题：给15分（满分20），批阅后总分=自动40+人工15=55
    const attemptDetail = await request(server).get(`/api/v1/training/attempts/${attempt.id}`).set(authed(storeManagerToken)).expect(200);
    const shortAnswerAnswerId = body<{ answers: { id: string; question: { type: string } }[] }>(attemptDetail).answers.find((a) => a.question.type === 'SHORT_ANSWER')!.id;

    const graded = await request(server)
      .post(`/api/v1/training/attempts/${attempt.id}/grade`)
      .set(authed(storeManagerToken))
      .send({ answers: [{ answerId: shortAnswerAnswerId, score: 15 }] })
      .expect(201);
    const gradedAttempt = body<ExamAttempt>(graded);
    expect(gradedAttempt.status).toBe('COMPLETED');
    expect(gradedAttempt.manualScore).toBe(15);
    expect(gradedAttempt.totalScore).toBe(55);

    await request(server)
      .post(`/api/v1/training/attempts/${attempt.id}/grade`)
      .set(authed(storeManagerToken))
      .send({ answers: [{ answerId: shortAnswerAnswerId, score: 10 }] })
      .expect(400); // 已批阅完成的作答不能重复批阅
  });
});
