import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { TrainingExamService } from './training-exam.service';
import { CreateTrainingExamDto } from './dto/create-training-exam.dto';
import { UpdateTrainingExamDto } from './dto/update-training-exam.dto';

@ApiTags('training/exam')
@Controller('training/exams')
export class TrainingExamController {
  constructor(private readonly trainingExamService: TrainingExamService) {}

  @Get()
  @RequirePermission('training.exam.view')
  findAll() {
    return this.trainingExamService.findMany();
  }

  @Get(':id')
  @RequirePermission('training.exam.view')
  findOne(@Param('id') id: string) {
    return this.trainingExamService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('training.exam.create')
  create(@Body() dto: CreateTrainingExamDto) {
    return this.trainingExamService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('training.exam.update')
  update(@Param('id') id: string, @Body() dto: UpdateTrainingExamDto) {
    return this.trainingExamService.update(id, dto);
  }
}
