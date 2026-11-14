import { Injectable } from '@nestjs/common';
import { DietaryRestriction, DietaryRestrictionCategory } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit/audit-log.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { BaseScopedCrudService } from '../../common/base/base-scoped-crud.service';

@Injectable()
export class DietaryRestrictionService extends BaseScopedCrudService<DietaryRestriction> {
  protected readonly entityType = 'DietaryRestriction';

  constructor(
    private readonly prisma: PrismaService,
    auditLogService: AuditLogService,
    ctx: RequestContextService,
  ) {
    super(auditLogService, ctx);
  }

  protected get delegate() {
    return this.prisma.dietaryRestriction;
  }

  findMany(): Promise<DietaryRestriction[]> {
    return this.prisma.dietaryRestriction.findMany({ where: { tenantId: this.ctx.tenantId }, orderBy: { createdAt: 'desc' } });
  }

  create(data: { code: string; name: string; category: DietaryRestrictionCategory }) {
    return super.create({ ...data, tenantId: this.ctx.tenantId });
  }
}
