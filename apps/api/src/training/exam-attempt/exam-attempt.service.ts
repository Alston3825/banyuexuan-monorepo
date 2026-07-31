import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ExamQuestion } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { SubmitExamAttemptDto } from './dto/submit-exam-attempt.dto';
import { GradeExamAttemptDto } from './dto/grade-exam-attempt.dto';

/** 员工端不应看到正确答案，列表/单条查询都显式排除 correctAnswer 字段。 */
const sanitizedQuestionSelect = {
  id: true,
  order: true,
  type: true,
  content: true,
  options: true,
  score: true,
} as const;

const attemptInclude = {
  exam: { select: { id: true, title: true, passScore: true } },
  account: { select: { id: true, realName: true, username: true } },
  answers: { include: { question: { select: sanitizedQuestionSelect } } },
};

function isSetEqual(a: unknown, b: unknown): boolean {
  const arrA = Array.isArray(a) ? [...a].sort() : [a];
  const arrB = Array.isArray(b) ? [...b].sort() : [b];
  return JSON.stringify(arrA) === JSON.stringify(arrB);
}

/**
 * 参加考试对全体员工开放，简答题批阅是店长一步给分完成（不接通用工作流引擎）。
 * 只有 PUBLISHED 状态的试卷允许作答（同 TrainingExamService"只有草稿能改、只有发布的能考"的约束对应）。
 */
@Injectable()
export class ExamAttemptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  listAvailableExams() {
    return this.prisma.trainingExam.findMany({
      where: { tenantId: this.ctx.tenantId, status: 'PUBLISHED' },
      select: { id: true, title: true, studyMaterial: true, passScore: true, questions: { select: sanitizedQuestionSelect, orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getExamForAttemptOrThrow(examId: string) {
    const exam = await this.prisma.trainingExam.findUnique({
      where: { id: examId },
      select: { id: true, title: true, studyMaterial: true, passScore: true, status: true, questions: { select: sanitizedQuestionSelect, orderBy: { order: 'asc' } } },
    });
    if (!exam) throw new NotFoundException(`TrainingExam ${examId} 不存在`);
    if (exam.status !== 'PUBLISHED') throw new BadRequestException('该试卷未发布，不能作答');
    return exam;
  }

  findMyAttempts() {
    return this.prisma.examAttempt.findMany({
      where: { tenantId: this.ctx.tenantId, accountId: this.ctx.accountId },
      include: attemptInclude,
      orderBy: { submittedAt: 'desc' },
    });
  }

  /** 待批阅列表：给店长看有哪些简答题作答需要批阅。 */
  findPendingGrading() {
    return this.prisma.examAttempt.findMany({
      where: { tenantId: this.ctx.tenantId, status: 'PENDING_GRADING' },
      include: attemptInclude,
      orderBy: { submittedAt: 'asc' },
    });
  }

  async findOneAttemptOrThrow(id: string) {
    const attempt = await this.prisma.examAttempt.findUnique({ where: { id }, include: attemptInclude });
    if (!attempt) throw new NotFoundException(`ExamAttempt ${id} 不存在`);
    return attempt;
  }

  async submit(dto: SubmitExamAttemptDto) {
    const exam = await this.prisma.trainingExam.findUnique({ where: { id: dto.examId }, include: { questions: true } });
    if (!exam) throw new NotFoundException(`TrainingExam ${dto.examId} 不存在`);
    if (exam.status !== 'PUBLISHED') throw new BadRequestException('该试卷未发布，不能作答');

    const questionMap = new Map<string, ExamQuestion>(exam.questions.map((q) => [q.id, q]));
    if (dto.answers.some((a) => !questionMap.has(a.questionId))) {
      throw new BadRequestException('存在不属于该试卷的题目');
    }

    let autoScore = 0;
    let hasShortAnswer = false;
    const answerRows = dto.answers.map((a) => {
      const question = questionMap.get(a.questionId)!;
      if (question.type === 'SHORT_ANSWER') {
        hasShortAnswer = true;
        return { questionId: a.questionId, selectedKeys: undefined, textAnswer: a.textAnswer, isCorrect: null, score: 0 };
      }
      const isCorrect = isSetEqual(a.selectedKeys, question.correctAnswer);
      const score = isCorrect ? question.score : 0;
      autoScore += score;
      return { questionId: a.questionId, selectedKeys: a.selectedKeys as never, textAnswer: undefined, isCorrect, score };
    });

    const created = await this.prisma.$transaction(async (tx) => {
      const attempt = await tx.examAttempt.create({
        data: {
          tenantId: this.ctx.tenantId!,
          examId: dto.examId,
          accountId: this.ctx.accountId!,
          autoScore,
          totalScore: hasShortAnswer ? null : autoScore,
          status: hasShortAnswer ? 'PENDING_GRADING' : 'COMPLETED',
          createdBy: this.ctx.accountId!,
        },
      });
      await tx.examAnswer.createMany({
        data: answerRows.map((r) => ({ tenantId: this.ctx.tenantId!, attemptId: attempt.id, ...r })),
      });
      return attempt;
    });

    const withAnswers = await this.findOneAttemptOrThrow(created.id);
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'ExamAttempt',
      entityId: created.id,
      afterData: withAnswers,
      ...this.auditCtx(),
    });
    return withAnswers;
  }

  async grade(attemptId: string, dto: GradeExamAttemptDto) {
    const before = await this.findOneAttemptOrThrow(attemptId);
    if (before.status !== 'PENDING_GRADING') {
      throw new BadRequestException(`该作答当前状态「${before.status}」不允许批阅`);
    }
    const shortAnswerIds = new Set(before.answers.filter((a) => a.question.type === 'SHORT_ANSWER').map((a) => a.id));
    if (dto.answers.some((a) => !shortAnswerIds.has(a.answerId))) {
      throw new BadRequestException('只能批阅该作答里的简答题');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const a of dto.answers) {
        await tx.examAnswer.update({ where: { id: a.answerId }, data: { score: a.score } });
      }
    });

    const refreshed = await this.findOneAttemptOrThrow(attemptId);
    const manualScore = refreshed.answers.filter((a) => a.question.type === 'SHORT_ANSWER').reduce((sum, a) => sum + a.score, 0);
    const totalScore = refreshed.autoScore + manualScore;

    const updated = await this.prisma.examAttempt.update({
      where: { id: attemptId },
      data: { manualScore, totalScore, status: 'COMPLETED', gradedById: this.ctx.accountId, gradedAt: new Date(), version: { increment: 1 } },
    });
    const withAnswers = await this.findOneAttemptOrThrow(updated.id);
    await this.auditLogService.record({
      action: 'STATE_TRANSITION',
      entityType: 'ExamAttempt',
      entityId: attemptId,
      beforeData: before,
      afterData: withAnswers,
      remark: `PENDING_GRADING -> COMPLETED（简答题批阅完成，总分${totalScore}）`,
      ...this.auditCtx(),
    });
    return withAnswers;
  }

  private auditCtx() {
    return {
      tenantId: this.ctx.tenantId,
      storeId: this.ctx.homeStoreId,
      accountId: this.ctx.accountId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    };
  }
}
