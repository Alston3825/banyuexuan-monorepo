import { Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { RequestContextService } from '../../common/context/request-context.service';
import { ActorContext } from '../../common/context/actor-context';
import { WorkflowEngineService } from './workflow-engine.service';
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
    return this.workflowEngineService.reassign(id, dto.toAccountId, this.actor(), dto.comment);
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
