import { Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { RequestContextService } from '../../common/context/request-context.service';
import { ActorContext } from '../../common/context/actor-context';
import { WorkflowEngineService } from './workflow-engine.service';
import { WorkflowQueryService } from './workflow-query.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CommentDto } from './dto/comment.dto';
import { ReassignDto } from './dto/reassign.dto';
import { AddApproverDto } from './dto/add-approver.dto';
import { CcDto } from './dto/cc.dto';
import { QueryWorkflowInstanceDto } from './dto/query-workflow-instance.dto';

@ApiTags('workflow/instance')
@Controller('workflow/instances')
export class WorkflowEngineController {
  constructor(
    private readonly workflowEngineService: WorkflowEngineService,
    private readonly queryService: WorkflowQueryService,
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContextService,
  ) {}

  /** 按业务单据反查最新一条挂在它身上的 WorkflowInstance，供业务模块详情页跳转查看审批进度。 */
  @Get()
  @RequirePermission('workflow.instance.view')
  findByBusiness(@Query() query: QueryWorkflowInstanceDto) {
    return this.prisma.workflowInstance.findFirst({
      where: { tenantId: this.ctx.tenantId, businessType: query.businessType, businessId: query.businessId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** 审批中心：tab = pending 待我审批 / done 我已处理 / mine 我发起的 / cc 抄送我的。 */
  @Get('approvals')
  @RequirePermission('workflow.instance.view')
  approvals(@Query('tab') tab = 'pending', @Query('keyword') keyword?: string) {
    const t = (['pending', 'done', 'mine', 'cc'] as const).find((x) => x === tab) ?? 'pending';
    return this.queryService.approvals(t, keyword);
  }

  /** 业务单据详情页用：按“单据类型+单据id”取审批进度（没有审批返回 null）。 */
  @Get('progress')
  @RequirePermission('workflow.instance.view')
  async progressByBusiness(@Query() query: QueryWorkflowInstanceDto) {
    const id = await this.queryService.instanceIdByBusiness(query.businessType, query.businessId);
    return id ? this.queryService.progress(id) : null;
  }

  @Get(':id/progress')
  @RequirePermission('workflow.instance.view')
  progress(@Param('id') id: string) {
    return this.queryService.progress(id);
  }

  @Post(':id/urge')
  @RequirePermission('workflow.instance.view')
  urge(@Param('id') id: string, @Body() dto: CommentDto) {
    return this.workflowEngineService.urge(id, this.actor(), dto.comment);
  }

  @Get(':id')
  @RequirePermission('workflow.instance.view')
  async findOne(@Param('id') id: string) {
    const instance = await this.prisma.workflowInstance.findUnique({
      where: { id },
      include: {
        approvers: { orderBy: [{ nodeSeq: 'asc' }, { createdAt: 'asc' }] },
        actions: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!instance) throw new NotFoundException(`WorkflowInstance ${id} 不存在`);
    return instance;
  }

  @Post(':id/approve')
  @RequirePermission('workflow.instance.approve')
  approve(@Param('id') id: string, @Body() dto: CommentDto) {
    return this.workflowEngineService.approve(id, this.actor(), dto.comment);
  }

  @Post(':id/reject')
  @RequirePermission('workflow.instance.reject')
  reject(@Param('id') id: string, @Body() dto: CommentDto) {
    return this.workflowEngineService.reject(id, this.actor(), dto.comment);
  }

  @Post(':id/withdraw')
  @RequirePermission('workflow.instance.withdraw')
  withdraw(@Param('id') id: string, @Body() dto: CommentDto) {
    return this.workflowEngineService.withdraw(id, this.actor(), dto.comment);
  }

  @Post(':id/reassign')
  @RequirePermission('workflow.instance.reassign')
  reassign(@Param('id') id: string, @Body() dto: ReassignDto) {
    // 拥有“修改审批流程”权限的管理员，即使自己不是审批人也能把卡住的单据转给别人
    return this.ctx.hasPermission('workflow.definition.update').then((asAdmin) => this.workflowEngineService.reassign(id, dto.toAccountId, this.actor(), dto.comment, asAdmin));
  }

  @Post(':id/add-approver')
  @RequirePermission('workflow.instance.add-approver')
  addApprover(@Param('id') id: string, @Body() dto: AddApproverDto) {
    return this.workflowEngineService.addApprover(id, dto.accountId, this.actor(), dto.comment);
  }

  @Post(':id/cc')
  @RequirePermission('workflow.instance.cc')
  cc(@Param('id') id: string, @Body() dto: CcDto) {
    return this.workflowEngineService.cc(id, dto.accountIds, this.actor());
  }

  /** 手动立即归档，主要用于测试时不必等待 BullMQ 延迟任务。 */
  @Post(':id/archive')
  @RequirePermission('workflow.instance.archive')
  archive(@Param('id') id: string) {
    return this.workflowEngineService.archive(id, this.actor());
  }

  private actor(): ActorContext {
    return {
      accountId: this.ctx.accountId,
      tenantId: this.ctx.tenantId,
      storeId: this.ctx.homeStoreId,
      ip: this.ctx.ip,
      userAgent: this.ctx.userAgent,
      requestId: this.ctx.requestId,
    };
  }
}
