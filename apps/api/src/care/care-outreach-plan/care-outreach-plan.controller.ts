import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CareOutreachPlanService } from './care-outreach-plan.service';
import { CreateCareOutreachPlanDto } from './dto/create-care-outreach-plan.dto';
import { QueryCareOutreachPlanDto } from './dto/query-care-outreach-plan.dto';
import { TerminateCareOutreachPlanDto } from './dto/terminate-care-outreach-plan.dto';
import { CompleteCareOutreachTaskDto } from './dto/complete-care-outreach-task.dto';

@ApiTags('care/outreach-plan')
@Controller('care/outreach-plans')
export class CareOutreachPlanController {
  constructor(private readonly careOutreachPlanService: CareOutreachPlanService) {}

  // 字面量路由必须排在 :id 之前（同 meal-record report 路由的坑一致）。
  @Get('pending-tasks')
  @RequirePermission('care.outreach-plan.view')
  findPendingTasks() {
    return this.careOutreachPlanService.findPendingTasks();
  }

  @Get()
  @RequirePermission('care.outreach-plan.view')
  findAll(@Query() query: QueryCareOutreachPlanDto) {
    return this.careOutreachPlanService.findMany(query);
  }

  @Get(':id')
  @RequirePermission('care.outreach-plan.view')
  findOne(@Param('id') id: string) {
    return this.careOutreachPlanService.findOneOrThrow(id);
  }

  @Post()
  @RequirePermission('care.outreach-plan.create')
  create(@Body() dto: CreateCareOutreachPlanDto) {
    return this.careOutreachPlanService.create(dto);
  }

  @Patch(':id/terminate')
  @RequirePermission('care.outreach-plan.terminate')
  terminate(@Param('id') id: string, @Body() dto: TerminateCareOutreachPlanDto) {
    return this.careOutreachPlanService.terminate(id, dto.reason, dto.version);
  }

  @Patch('tasks/:taskId/complete')
  @RequirePermission('care.outreach-plan.complete-task')
  completeTask(@Param('taskId') taskId: string, @Body() dto: CompleteCareOutreachTaskDto) {
    return this.careOutreachPlanService.completeTask(taskId, dto);
  }
}
