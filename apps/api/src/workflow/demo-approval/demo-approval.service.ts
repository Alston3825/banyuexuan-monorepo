import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DemoApprovalRequest, WorkflowInstance } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { WorkflowEngineService } from '../workflow-engine/workflow-engine.service';
import { ActorContext } from '../../common/context/actor-context';

const BUSINESS_TYPE = 'DEMO_APPROVAL';
const DEFINITION_CODE = 'DEMO_APPROVAL';

@Injectable()
export class DemoApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowEngineService: WorkflowEngineService,
    private readonly ctx: RequestContextService,
  ) {}

  findMany(): Promise<DemoApprovalRequest[]> {
    return this.prisma.demoApprovalRequest.findMany({ where: { tenantId: this.ctx.tenantId } });
  }

  async findOneOrThrow(id: string): Promise<DemoApprovalRequest> {
    const request = await this.prisma.demoApprovalRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException(`DemoApprovalRequest ${id} 不存在`);
    return request;
  }

  async create(data: { title: string; content: string; amount?: number }): Promise<DemoApprovalRequest> {
    return this.prisma.demoApprovalRequest.create({
      data: {
        ...data,
        tenantId: this.ctx.tenantId!,
        storeId: this.ctx.homeStoreId,
        applicantId: this.ctx.accountId!,
        createdBy: this.ctx.accountId!,
      },
    });
  }

  /** 提交进入工作流引擎，返回生成的 WorkflowInstance（而非 DemoApprovalRequest 本身）。 */
  async submit(id: string): Promise<WorkflowInstance> {
    const request = await this.findOneOrThrow(id);
    if (request.status !== 'DRAFT') {
      throw new ConflictException('该示例审批单已提交过，不可重复提交');
    }

    const instance = await this.workflowEngineService.startInstance(
      {
        definitionCode: DEFINITION_CODE,
        businessType: BUSINESS_TYPE,
        businessId: id,
        title: request.title,
        storeId: request.storeId,
      },
      this.actor(),
    );

    await this.prisma.demoApprovalRequest.update({
      where: { id },
      data: { status: instance.status, version: { increment: 1 } },
    });

    return instance;
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
