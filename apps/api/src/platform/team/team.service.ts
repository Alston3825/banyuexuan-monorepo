import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { DataScopeService } from '../../common/scope/data-scope.service';
import { BaseScopedCrudService } from '../../common/base/base-scoped-crud.service';
import { Team } from '@prisma/client';

@Injectable()
export class TeamService extends BaseScopedCrudService<Team> {
  protected readonly entityType = 'Team';

  constructor(
    private readonly prisma: PrismaService,
    private readonly dataScopeService: DataScopeService,
    auditLogService: AuditLogService,
    ctx: RequestContextService,
  ) {
    super(auditLogService, ctx);
  }

  protected get delegate() {
    return this.prisma.team;
  }

  /** storeId 从所属部门冗余，不接受调用方直接传入，避免与部门数据不一致。 */
  async create(data: { code: string; name: string; departmentId: string }): Promise<Team> {
    const department = await this.prisma.department.findUnique({ where: { id: data.departmentId } });
    if (!department) throw new NotFoundException('所属部门不存在');
    await this.dataScopeService.assertStoreAccessible(this.ctx, department.storeId);
    return super.create({ ...data, storeId: department.storeId, tenantId: this.ctx.tenantId });
  }
}
