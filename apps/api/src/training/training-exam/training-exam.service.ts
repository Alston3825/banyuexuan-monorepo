import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { runVersionedUpdate } from '../../common/utils/versioned-update.util';
import { CreateTrainingExamDto } from './dto/create-training-exam.dto';
import { UpdateTrainingExamDto } from './dto/update-training-exam.dto';

const includeQuestions = {
  questions: { orderBy: { order: 'asc' as const } },
};

/**
 * 试卷：总部统一培训标准（同 room.type/care.field 口径，仅 SUPER_ADMIN 维护）。
 * 创建/替换题目列表都在事务里做，避免出现"试卷存在但题目为空"的中间态
 * （同 CareFormTemplateService 的写法）。
 */
@Injectable()
export class TrainingExamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly ctx: RequestContextService,
  ) {}

  findMany() {
    return this.prisma.trainingExam.findMany({
      where: { tenantId: this.ctx.tenantId },
      include: includeQuestions,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneOrThrow(id: string) {
    const exam = await this.prisma.trainingExam.findUnique({ where: { id }, include: includeQuestions });
    if (!exam) throw new NotFoundException(`TrainingExam ${id} 不存在`);
    return exam;
  }

  async create(dto: CreateTrainingExamDto) {
    const created = await this.prisma.$transaction(async (tx) => {
      const exam = await tx.trainingExam.create({
        data: {
          tenantId: this.ctx.tenantId!,
          title: dto.title,
          studyMaterial: dto.studyMaterial,
          passScore: dto.passScore,
          createdBy: this.ctx.accountId!,
        },
      });
      await tx.examQuestion.createMany({
        data: dto.questions.map((q) => ({
          tenantId: this.ctx.tenantId!,
          examId: exam.id,
          order: q.order,
          type: q.type,
          content: q.content,
          options: q.options as never,
          correctAnswer: q.correctAnswer as never,
          score: q.score,
        })),
      });
      return exam;
    });
    const withQuestions = await this.findOneOrThrow(created.id);
    await this.auditLogService.record({
      action: 'CREATE',
      entityType: 'TrainingExam',
      entityId: created.id,
      afterData: withQuestions,
      ...this.auditCtx(),
    });
    return withQuestions;
  }

  async update(id: string, dto: UpdateTrainingExamDto) {
    const before = await this.findOneOrThrow(id);
    if (before.version !== dto.version) {
      throw new ConflictException('数据已被他人修改，请刷新后重试');
    }
    if (dto.questions && before.status !== 'DRAFT') {
      throw new BadRequestException('试卷已发布，可能已有员工作答，不能整体替换题目列表；如需变更内容请重新创建试卷');
    }
    const updated = await runVersionedUpdate(() => this.prisma.$transaction(async (tx) => {
      const exam = await tx.trainingExam.update({
        where: { id, version: dto.version },
        data: {
          title: dto.title,
          studyMaterial: dto.studyMaterial,
          passScore: dto.passScore,
          status: dto.status,
          version: { increment: 1 },
        },
      });
      if (dto.questions) {
        await tx.examQuestion.deleteMany({ where: { examId: id } });
        await tx.examQuestion.createMany({
          data: dto.questions.map((q) => ({
            tenantId: this.ctx.tenantId!,
            examId: id,
            order: q.order,
            type: q.type,
            content: q.content,
            options: q.options as never,
            correctAnswer: q.correctAnswer as never,
            score: q.score,
          })),
        });
      }
      return exam;
    }));
    const withQuestions = await this.findOneOrThrow(updated.id);
    await this.auditLogService.record({
      action: 'UPDATE',
      entityType: 'TrainingExam',
      entityId: id,
      beforeData: before,
      afterData: withQuestions,
      changedFields: Object.keys(dto).filter((k) => k !== 'version'),
      ...this.auditCtx(),
    });
    return withQuestions;
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
