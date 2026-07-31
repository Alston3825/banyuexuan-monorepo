import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ExamAttemptService } from './exam-attempt.service';
import { SubmitExamAttemptDto } from './dto/submit-exam-attempt.dto';
import { GradeExamAttemptDto } from './dto/grade-exam-attempt.dto';

@ApiTags('training/exam-attempt')
@Controller('training/attempts')
export class ExamAttemptController {
  constructor(private readonly examAttemptService: ExamAttemptService) {}

  // 字面量路由必须排在 :id 之前，否则会被 Nest 误判为 :id 参数（同 meal-record report 路由的坑一致）。
  @Get('available-exams')
  @RequirePermission('training.exam-attempt.view')
  listAvailableExams() {
    return this.examAttemptService.listAvailableExams();
  }

  @Get('exams/:id')
  @RequirePermission('training.exam-attempt.view')
  getExamForAttempt(@Param('id') id: string) {
    return this.examAttemptService.getExamForAttemptOrThrow(id);
  }

  @Get('mine')
  @RequirePermission('training.exam-attempt.view')
  findMine() {
    return this.examAttemptService.findMyAttempts();
  }

  @Get('pending-grading')
  @RequirePermission('training.exam-attempt.grade')
  findPendingGrading() {
    return this.examAttemptService.findPendingGrading();
  }

  @Post()
  @RequirePermission('training.exam-attempt.submit')
  submit(@Body() dto: SubmitExamAttemptDto) {
    return this.examAttemptService.submit(dto);
  }

  @Get(':id')
  @RequirePermission('training.exam-attempt.view')
  findOne(@Param('id') id: string) {
    return this.examAttemptService.findOneAttemptOrThrow(id);
  }

  @Post(':id/grade')
  @RequirePermission('training.exam-attempt.grade')
  grade(@Param('id') id: string, @Body() dto: GradeExamAttemptDto) {
    return this.examAttemptService.grade(id, dto);
  }
}
