import { Module } from '@nestjs/common';
import { TrainingExamController } from './training-exam.controller';
import { TrainingExamService } from './training-exam.service';

@Module({
  controllers: [TrainingExamController],
  providers: [TrainingExamService],
  exports: [TrainingExamService],
})
export class TrainingExamModule {}
