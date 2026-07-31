import { Module } from '@nestjs/common';
import { TrainingExamModule } from './training-exam/training-exam.module';
import { ExamAttemptModule } from './exam-attempt/exam-attempt.module';

@Module({
  imports: [TrainingExamModule, ExamAttemptModule],
})
export class TrainingModule {}
