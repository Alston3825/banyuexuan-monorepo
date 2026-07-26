import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestContextService } from '../../common/context/request-context.service';

@Injectable()
export class WorkflowDefinitionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContextService,
  ) {}

  findMany() {
    return this.prisma.workflowDefinition.findMany({
      where: { tenantId: this.ctx.tenantId, status: 'PUBLISHED' },
      include: { nodes: { orderBy: { seq: 'asc' } } },
    });
  }
}
